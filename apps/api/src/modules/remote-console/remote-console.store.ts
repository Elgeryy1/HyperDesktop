import { randomUUID } from "node:crypto";
import { env } from "../../lib/env.js";

export type RemoteConsoleProtocol = "VNC" | "RDP";

export type RemoteConsoleSession = {
  id: string;
  vmId: string;
  protocol: RemoteConsoleProtocol;
  token: string;
  targetHost: string;
  targetPort: number;
  createdById: string;
  expiresAt: string;
  launchUrl: string;
};

const sessions = new Map<string, RemoteConsoleSession>();
const sessionDisposers = new Map<string, () => void>();

function asWsUrl(httpUrl: string): string {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function getSessionTtlMs(): number {
  return env.REMOTE_CONSOLE_TTL_SECONDS * 1000;
}

export function createRemoteConsoleSession(input: {
  vmId: string;
  protocol: RemoteConsoleProtocol;
  targetHost: string;
  targetPort: number;
  createdById: string;
  dispose?: () => void;
}): RemoteConsoleSession {
  const id = randomUUID();
  const token = randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();

  const launchUrl =
    input.protocol === "VNC"
      ? `${env.WEB_PUBLIC_URL}/remote-console/vnc/${id}?token=${token}`
      : `${env.API_PUBLIC_URL}/api/v1/remote-console/sessions/${id}/rdp-file?token=${token}`;

  const session: RemoteConsoleSession = {
    id,
    vmId: input.vmId,
    protocol: input.protocol,
    token,
    targetHost: input.targetHost,
    targetPort: input.targetPort,
    createdById: input.createdById,
    expiresAt,
    launchUrl
  };

  sessions.set(id, session);
  if (input.dispose) {
    sessionDisposers.set(id, input.dispose);
  }
  return session;
}

export function getRemoteConsoleSession(id: string): RemoteConsoleSession | null {
  const session = sessions.get(id) ?? null;
  if (!session) {
    return null;
  }

  if (Date.parse(session.expiresAt) <= Date.now()) {
    evictSession(id);
    return null;
  }

  return session;
}

export function deleteRemoteConsoleSession(id: string): void {
  evictSession(id);
}

export function validateRemoteConsoleSession(input: {
  id: string;
  token: string;
  protocol?: RemoteConsoleProtocol;
}): RemoteConsoleSession | null {
  const session = getRemoteConsoleSession(input.id);
  if (!session) {
    return null;
  }
  if (session.token !== input.token) {
    return null;
  }
  if (input.protocol && session.protocol !== input.protocol) {
    return null;
  }
  return session;
}

export function buildVncProxyWsUrl(session: RemoteConsoleSession): string {
  const base = `${env.API_PUBLIC_URL}/api/v1/remote-console/sessions/${session.id}/vnc?token=${session.token}`;
  return asWsUrl(base);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (Date.parse(session.expiresAt) <= now) {
      evictSession(id);
    }
  }
}, 60_000).unref();

function evictSession(id: string): void {
  sessions.delete(id);
  const disposer = sessionDisposers.get(id);
  sessionDisposers.delete(id);
  if (!disposer) {
    return;
  }

  try {
    disposer();
  } catch {
    // Ignore disposer failures.
  }
}
