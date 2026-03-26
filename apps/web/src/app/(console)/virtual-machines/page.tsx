"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../../lib/api";
import { StateBadge } from "../../../components/state-badge";
import { VmScheduleBadge } from "../../../components/vm-schedule-badge";
import { Plus, Search, Monitor, Play, Square, RotateCcw, MonitorPlay, Trash2, ExternalLink, Pencil, Power, Save } from "lucide-react";

type VmItem = {
  id: string;
  name: string;
  state: string;
  vcpu: number;
  memoryMb: number;
  ipAddress: string | null;
  autoStopAt: string | null;
  expiresAt: string | null;
  expirationAction: "STOP" | "DELETE";
  host: {
    name: string;
  };
};

type ConsoleSession = {
  id: string;
  protocol: "VNC" | "RDP";
  launchUrl: string;
};

type MePayload = {
  id: string;
  role: "ADMINISTRADOR" | "PROFESOR" | "ALUMNO";
};

export default function VirtualMachinesPage() {
  const [vms, setVms] = useState<VmItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [templateLoadingId, setTemplateLoadingId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<MePayload["role"] | null>(null);
  const [search, setSearch] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  const loadVms = async (query?: string) => {
    try {
      setError(null);
      const suffix = query ? `?search=${encodeURIComponent(query)}` : "";
      const result = await apiRequest<VmItem[]>(`/virtual-machines${suffix}`);
      setVms(result);
      setIsLoaded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load VMs");
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadVms();
      try {
        const me = await apiRequest<MePayload>("/auth/me");
        setMeRole(me.role);
      } catch {
        // noop
      }
    })();
  }, []);

  const runAction = async (vmId: string, action: "start" | "stop" | "force-stop" | "reboot" | "delete") => {
    if (action === "delete") {
      const confirmed = window.confirm("Are you sure you want to permanently delete this VM? This action cannot be undone.");
      if (!confirmed) return;
    }
    if (action === "force-stop") {
      const confirmed = window.confirm("Force power off this VM? Unsaved guest OS data may be lost.");
      if (!confirmed) return;
    }

    setLoadingId(`${vmId}-${action}`);
    try {
      if (action === "delete") {
        await apiRequest(`/virtual-machines/${vmId}`, { method: "DELETE" });
      } else {
        await apiRequest(`/virtual-machines/${vmId}/actions/${action}`, { method: "POST" });
      }
      await loadVms(search);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action} VM`);
    } finally {
      setLoadingId(null);
    }
  };

  const openConsole = async (vmId: string, protocol: "VNC" | "RDP") => {
    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) {
      pendingWindow.document.title = `Opening ${protocol} console...`;
      pendingWindow.document.body.innerHTML = `<div style="font-family:Arial,sans-serif;padding:16px;color:#111;">Opening ${protocol} console...</div>`;
    }

    try {
      const session = await apiRequest<ConsoleSession>("/remote-console/sessions", {
        method: "POST",
        body: { vmId, protocol }
      });

      if (pendingWindow) {
        try {
          pendingWindow.opener = null;
        } catch {
          // noop
        }
        pendingWindow.location.replace(session.launchUrl);
        pendingWindow.focus();
        return;
      }
      const launched = window.open(session.launchUrl, "_blank", "noopener,noreferrer");
      if (!launched) {
        window.location.href = session.launchUrl;
      }
    } catch (err) {
      if (pendingWindow && !pendingWindow.closed) {
        pendingWindow.close();
      }
      setError(err instanceof ApiError ? err.message : `Failed to open ${protocol} console`);
    }
  };

  const convertToTemplate = async (vmId: string, vmName: string) => {
    const suggestedName = `${vmName}-template`;
    const name = window.prompt("Nombre de la plantilla", suggestedName)?.trim();
    if (!name) return;
    const version = window.prompt("Version de la plantilla", "1.0")?.trim();

    setTemplateLoadingId(vmId);
    setError(null);
    try {
      await apiRequest(`/virtual-machines/${vmId}/actions/create-template`, {
        method: "POST",
        body: {
          name,
          version: version || undefined
        }
      });
      alert("Plantilla creada correctamente. Ya puedes asignarla desde Templates.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo convertir la VM en plantilla");
    } finally {
      setTemplateLoadingId(null);
    }
  };

  return (
    <section className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Virtual Machines</h1>
          <p className="page-subtitle">Manage and provision cloud lab environments</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
            <input
              className="input w-64 pl-10 pr-4"
              placeholder="Search VMs..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadVms(search);
              }}
            />
          </div>
          <Link href="/virtual-machines/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            New Instance
          </Link>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Table */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>CPU</th>
              <th>RAM</th>
              <th>IP Address</th>
              <th>Host</th>
              <th>Policy</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vms.map((vm) => (
              <tr key={vm.id}>
                <td>
                  <Link className="font-semibold text-white transition-colors hover:text-indigo-400" href={`/virtual-machines/${vm.id}`}>
                    {vm.name}
                  </Link>
                </td>
                <td>
                  <StateBadge state={vm.state} />
                </td>
                <td>
                  <span className="text-neutral-300">{vm.vcpu} <span className="text-neutral-500">vCPU</span></span>
                </td>
                <td>
                  <span className="text-neutral-300">
                    {vm.memoryMb >= 1024 ? `${(vm.memoryMb / 1024).toFixed(1)} GB` : `${vm.memoryMb} MB`}
                  </span>
                </td>
                <td>
                  <code className="text-xs text-neutral-400 bg-white/[0.03] px-2 py-0.5 rounded">
                    {vm.ipAddress ?? "Not assigned"}
                  </code>
                </td>
                <td className="text-neutral-400">{vm.host?.name ?? "-"}</td>
                <td>
                  <VmScheduleBadge
                    autoStopAt={vm.autoStopAt}
                    expiresAt={vm.expiresAt}
                    expirationAction={vm.expirationAction}
                    compact
                  />
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      className="btn-icon"
                      title="Start"
                      disabled={Boolean(loadingId)}
                      onClick={() => runAction(vm.id, "start")}
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Stop"
                      disabled={Boolean(loadingId)}
                      onClick={() => runAction(vm.id, "stop")}
                    >
                      <Square className="h-4 w-4" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Reboot"
                      disabled={Boolean(loadingId)}
                      onClick={() => runAction(vm.id, "reboot")}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      className="btn-icon text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10"
                      title="Force Off"
                      disabled={Boolean(loadingId)}
                      onClick={() => runAction(vm.id, "force-stop")}
                    >
                      <Power className="h-4 w-4" />
                    </button>

                    <div className="h-5 w-px bg-white/[0.06] mx-0.5" />

                    <button
                      className="btn-icon"
                      title="Open VNC"
                      disabled={Boolean(loadingId)}
                      onClick={() => void openConsole(vm.id, "VNC")}
                    >
                      <MonitorPlay className="h-4 w-4" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Open RDP"
                      disabled={Boolean(loadingId)}
                      onClick={() => void openConsole(vm.id, "RDP")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>

                    <div className="h-5 w-px bg-white/[0.06] mx-0.5" />

                    <Link className="btn-icon" title="Edit VM" href={`/virtual-machines/${vm.id}/edit`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                    {meRole !== "ALUMNO" && (
                      <button
                        className="btn-icon text-indigo-300/80 hover:text-indigo-200 hover:bg-indigo-500/10"
                        title="Convertir en plantilla"
                        disabled={Boolean(loadingId) || templateLoadingId === vm.id}
                        onClick={() => void convertToTemplate(vm.id, vm.name)}
                      >
                        <Save className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      className="btn-icon text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                      title="Delete"
                      disabled={Boolean(loadingId)}
                      onClick={() => runAction(vm.id, "delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {isLoaded && !vms.length && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <Monitor className="h-7 w-7" />
                    </div>
                    <p className="empty-state-title">No virtual machines yet</p>
                    <p className="empty-state-text">Create your first instance to get started with your cloud lab.</p>
                    <Link href="/virtual-machines/new" className="btn-primary mt-4">
                      <Plus className="h-4 w-4" />
                      Create Instance
                    </Link>
                  </div>
                </td>
              </tr>
            )}
            {!isLoaded && (
              <tr>
                <td colSpan={8}>
                  <div className="py-12 text-center">
                    <svg className="mx-auto h-6 w-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="mt-3 text-sm text-neutral-500">Loading virtual machines...</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
