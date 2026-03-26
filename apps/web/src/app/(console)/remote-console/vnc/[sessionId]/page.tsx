"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MonitorPlay, AlertTriangle } from "lucide-react";

function resolveResizeMode(): "off" | "scale" | "remote" {
  const configured = (process.env.NEXT_PUBLIC_NOVNC_RESIZE_MODE ?? "remote").toLowerCase();
  if (configured === "off" || configured === "scale" || configured === "remote") {
    return configured;
  }
  return "remote";
}

function buildNoVncUrl(sessionId: string, token: string): string {
  const noVncBase = process.env.NEXT_PUBLIC_NOVNC_URL ?? "http://localhost:6081/static/vnc.html";
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const resizeMode = resolveResizeMode();

  const parsedNoVnc = new URL(noVncBase, window.location.origin);
  if (!parsedNoVnc.pathname || parsedNoVnc.pathname === "/") {
    parsedNoVnc.pathname = "/static/vnc.html";
  }

  const parsedApi = new URL(apiBase, window.location.origin);
  const apiPort = parsedApi.port || (parsedApi.protocol === "https:" ? "443" : "80");

  parsedNoVnc.searchParams.set("autoconnect", "1");
  parsedNoVnc.searchParams.set("resize", resizeMode);
  parsedNoVnc.searchParams.set("reconnect", "1");
  parsedNoVnc.searchParams.set("host", parsedApi.hostname);
  parsedNoVnc.searchParams.set("port", apiPort);
  parsedNoVnc.searchParams.set("path", `api/v1/remote-console/sessions/${sessionId}/vnc/${token}`);
  return parsedNoVnc.toString();
}

export default function VncConsolePage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const noVncUrl = useMemo(() => {
    if (!params.sessionId || !token || typeof window === "undefined") return "";
    try {
      return buildNoVncUrl(params.sessionId, token);
    } catch {
      return "";
    }
  }, [params.sessionId, token]);

  return (
    <section className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/virtual-machines" className="btn-ghost text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-5 w-px bg-white/[0.06]" />
          <div className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5 text-indigo-400" />
            <h1 className="text-lg font-bold text-white">VNC Console</h1>
          </div>
        </div>
        {noVncUrl && (
          <a className="btn-secondary text-xs" href={noVncUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open Directly
          </a>
        )}
      </div>

      {!noVncUrl ? (
        <div className="alert-warning flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Missing or invalid console session data. Please open the console again from the VM list.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="alert-info">
            VNC resize mode: <strong>{resolveResizeMode()}</strong>. For Windows guests, if remote resize is not applied, install guest display drivers/agent or use RDP for native dynamic resolution.
          </div>
          <div className="card-static p-2 overflow-hidden">
          <iframe
            className="h-[80vh] w-full rounded-lg border border-white/[0.06] bg-black"
            src={noVncUrl}
            title="VNC Console"
          />
        </div>
        </div>
      )}
    </section>
  );
}
