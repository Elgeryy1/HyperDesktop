import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { env } from "../../lib/env.js";

type SshEndpoint = {
  host: string;
  username?: string;
  port?: number;
};

const activeTunnels = new Map<number, ChildProcess>();

export type RdpTunnelTarget = {
  host: string;
  port: number;
  dispose: () => void;
};

export async function createRdpTunnelViaLibvirtSsh(input: {
  connectionUri: string;
  vmIpAddress: string;
  vmRdpPort: number;
  publicHost?: string;
}): Promise<RdpTunnelTarget | null> {
  if (env.REMOTE_CONSOLE_RDP_TUNNEL_MODE !== "libvirt_ssh") {
    return null;
  }

  const sshTarget = parseSshEndpoint(input.connectionUri);
  if (!sshTarget) {
    return null;
  }

  const resolvedPublicHost = resolvePublicTunnelHost(input.publicHost);

  const errors: string[] = [];
  for (let port = env.REMOTE_CONSOLE_RDP_TUNNEL_PORT_START; port <= env.REMOTE_CONSOLE_RDP_TUNNEL_PORT_END; port += 1) {
    if (activeTunnels.has(port)) {
      continue;
    }

    try {
      const process = await startTunnelProcess({
        sshTarget,
        localPort: port,
        remoteHost: input.vmIpAddress,
        remotePort: input.vmRdpPort
      });

      activeTunnels.set(port, process);
      process.on("exit", () => {
        activeTunnels.delete(port);
      });

      let disposed = false;
      return {
        host: resolvedPublicHost,
        port,
        dispose: () => {
          if (disposed) {
            return;
          }
          disposed = true;
          activeTunnels.delete(port);
          if (!process.killed) {
            process.kill("SIGTERM");
          }
        }
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const details = errors.at(-1);
  throw new Error(details ? `Unable to allocate RDP tunnel port: ${details}` : "Unable to allocate RDP tunnel port");
}

function resolvePublicTunnelHost(requestHost?: string): string {
  const configured = env.REMOTE_CONSOLE_RDP_TUNNEL_PUBLIC_HOST.trim();
  if (configured.toLowerCase() !== "auto") {
    return configured;
  }

  const candidate = requestHost?.trim();
  if (!candidate) {
    return "127.0.0.1";
  }

  return candidate;
}

function parseSshEndpoint(connectionUri: string): SshEndpoint | null {
  try {
    const parsed = new URL(connectionUri);
    if (parsed.protocol !== "qemu+ssh:" || !parsed.hostname) {
      return null;
    }

    return {
      host: parsed.hostname,
      username: parsed.username || undefined,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : undefined
    };
  } catch {
    return null;
  }
}

async function startTunnelProcess(input: {
  sshTarget: SshEndpoint;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}): Promise<ChildProcess> {
  const destination = `${input.sshTarget.username ? `${input.sshTarget.username}@` : ""}${input.sshTarget.host}`;
  const args = [
    "-N",
    "-g",
    "-o",
    "BatchMode=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=2",
    "-L",
    `0.0.0.0:${input.localPort}:${input.remoteHost}:${input.remotePort}`
  ];

  if (input.sshTarget.port) {
    args.push("-p", String(input.sshTarget.port));
  }
  args.push(destination);

  const child = spawn("ssh", args, {
    stdio: ["ignore", "ignore", "pipe"]
  });

  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString("utf8")}`;
    if (stderr.length > 6000) {
      stderr = stderr.slice(-6000);
    }
  });

  const ready = await waitUntilTunnelReady(child, input.localPort, env.REMOTE_CONSOLE_RDP_TUNNEL_READY_TIMEOUT_MS);
  if (!ready) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    const cleanedStderr = stderr.trim().replace(/\s+/g, " ");
    throw new Error(cleanedStderr || "ssh tunnel process did not become ready");
  }

  return child;
}

async function waitUntilTunnelReady(
  child: ChildProcess,
  port: number,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      return false;
    }

    const connected = await canConnect("127.0.0.1", port, 500);
    if (connected) {
      return true;
    }

    await sleep(150);
  }

  return false;
}

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let resolved = false;

    const finish = (value: boolean) => {
      if (resolved) {
        return;
      }
      resolved = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("close", () => finish(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
