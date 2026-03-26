"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiRequest } from "../../../../lib/api";
import { StateBadge } from "../../../../components/state-badge";
import { VmScheduleBadge } from "../../../../components/vm-schedule-badge";
import { VmScheduleEditor, type VmScheduleModel } from "../../../../components/vm-schedule-editor";
import {
  ArrowLeft,
  Cpu,
  MemoryStick,
  HardDrive,
  Globe,
  Server,
  User,
  Calendar,
  Monitor,
  MonitorPlay,
  ExternalLink,
  Play,
  Square,
  Pencil,
  Power,
  RotateCcw,
  Trash2,
  Layers,
  Save
} from "lucide-react";

type VmDetail = {
  id: string;
  name: string;
  state: string;
  vcpu: number;
  memoryMb: number;
  diskGb: number;
  diskVolumes: Array<{
    id: string;
    name: string;
    sizeGb: number;
    format: string;
    isBoot: boolean;
    storagePool: {
      id: string;
      name: string;
    };
  }>;
  ipAddress: string | null;
  osType: string | null;
  host: {
    id: string;
    name: string;
    status: string;
  };
  createdBy: {
    email: string;
    name: string;
  };
  autoStopAt: string | null;
  expiresAt: string | null;
  expirationAction: "STOP" | "DELETE";
  lastAutomatedActionAt: string | null;
  createdAt: string;
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

export default function VmDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [vm, setVm] = useState<VmDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [meRole, setMeRole] = useState<MePayload["role"] | null>(null);

  const patchLocalSchedule = (next: VmScheduleModel) => {
    setVm((current) => (current ? { ...current, ...next } : current));
  };

  const loadVm = async () => {
    try {
      const result = await apiRequest<VmDetail>(`/virtual-machines/${params.id}`);
      setVm(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load VM");
    }
  };

  useEffect(() => {
    void loadVm();
  }, [params.id]);

  useEffect(() => {
    void (async () => {
      try {
        const me = await apiRequest<MePayload>("/auth/me");
        setMeRole(me.role);
      } catch {
        // noop
      }
    })();
  }, []);

  const openConsole = async (protocol: "VNC" | "RDP") => {
    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) {
      pendingWindow.document.title = `Opening ${protocol} console...`;
      pendingWindow.document.body.innerHTML = `<div style="font-family:Arial,sans-serif;padding:16px;color:#111;">Opening ${protocol} console...</div>`;
    }

    try {
      const session = await apiRequest<ConsoleSession>("/remote-console/sessions", {
        method: "POST",
        body: { vmId: params.id, protocol }
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

  const runAction = async (action: "start" | "stop" | "force-stop" | "reboot" | "delete") => {
    if (action === "delete") {
      const confirmed = window.confirm("Permanently delete this VM? This cannot be undone.");
      if (!confirmed) return;
    }
    if (action === "force-stop") {
      const confirmed = window.confirm("Force power off this VM? Unsaved guest OS data may be lost.");
      if (!confirmed) return;
    }

    setActionLoading(action);
    try {
      if (action === "delete") {
        await apiRequest(`/virtual-machines/${params.id}`, { method: "DELETE" });
        router.replace("/virtual-machines");
        return;
      }
      await apiRequest(`/virtual-machines/${params.id}/actions/${action}`, { method: "POST" });
      await loadVm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const createTemplateFromVm = async () => {
    const suggestedName = vm?.name ? `${vm.name}-template` : "lab-template";
    const name = window.prompt("Nombre de la plantilla", suggestedName)?.trim();
    if (!name) return;
    const version = window.prompt("Version de la plantilla", "1.0")?.trim();

    setTemplateLoading(true);
    setError(null);
    try {
      await apiRequest(`/virtual-machines/${params.id}/actions/create-template`, {
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
      setTemplateLoading(false);
    }
  };

  if (error && !vm) {
    return (
      <section className="space-y-4">
        <Link href="/virtual-machines" className="btn-ghost text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to VMs
        </Link>
        <div className="alert-error">{error}</div>
      </section>
    );
  }

  if (!vm) {
    return (
      <section className="space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card-static space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-5 w-full" />
            ))}
          </div>
          <div className="card-static space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-5 w-full" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const computeSpecs = [
    { icon: Cpu, label: "vCPU", value: `${vm.vcpu} cores` },
    { icon: MemoryStick, label: "Memory", value: vm.memoryMb >= 1024 ? `${(vm.memoryMb / 1024).toFixed(1)} GB` : `${vm.memoryMb} MB` },
    { icon: HardDrive, label: "Disk", value: `${vm.diskGb} GB` },
    { icon: Layers, label: "OS Type", value: vm.osType ?? "Not specified" }
  ];

  const runtimeInfo = [
    { icon: Globe, label: "IP Address", value: vm.ipAddress ?? "Not assigned", mono: true },
    { icon: Server, label: "Host", value: vm.host.name },
    { icon: User, label: "Created by", value: vm.createdBy.name },
    { icon: Calendar, label: "Created", value: new Date(vm.createdAt).toLocaleString() }
  ];

  return (
    <section className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Link href="/virtual-machines" className="btn-ghost text-sm inline-flex">
        <ArrowLeft className="h-4 w-4" />
        Back to VMs
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <Monitor className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{vm.name}</h1>
              <StateBadge state={vm.state} />
            </div>
            <p className="text-sm text-neutral-500 mt-0.5">
              {vm.host.name} &middot; {vm.vcpu} vCPU &middot; {vm.memoryMb >= 1024 ? `${(vm.memoryMb / 1024).toFixed(1)} GB RAM` : `${vm.memoryMb} MB RAM`}
            </p>
            <div className="mt-2">
              <VmScheduleBadge autoStopAt={vm.autoStopAt} expiresAt={vm.expiresAt} expirationAction={vm.expirationAction} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link className="btn-secondary" href={`/virtual-machines/${vm.id}/edit`}>
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          {meRole !== "ALUMNO" && (
            <button className="btn-secondary" onClick={() => void createTemplateFromVm()} disabled={templateLoading}>
              <Save className="h-4 w-4" />
              {templateLoading ? "Convirtiendo..." : "Convertir en plantilla"}
            </button>
          )}
          <button className="btn-secondary" onClick={() => void openConsole("VNC")}>
            <MonitorPlay className="h-4 w-4" />
            VNC
          </button>
          <button className="btn-secondary" onClick={() => void openConsole("RDP")}>
            <ExternalLink className="h-4 w-4" />
            RDP
          </button>
          <div className="h-8 w-px bg-white/[0.06] mx-1" />
          <button
            className="btn-success"
            disabled={actionLoading !== null}
            onClick={() => runAction("start")}
          >
            <Play className="h-4 w-4" />
            Start
          </button>
          <button
            className="btn-secondary"
            disabled={actionLoading !== null}
            onClick={() => runAction("stop")}
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
          <button
            className="btn-secondary"
            disabled={actionLoading !== null}
            onClick={() => runAction("reboot")}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            className="btn-danger"
            disabled={actionLoading !== null}
            onClick={() => runAction("force-stop")}
          >
            <Power className="h-4 w-4" />
            Force Off
          </button>
          <button
            className="btn-danger"
            disabled={actionLoading !== null}
            onClick={() => runAction("delete")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Details grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <article className="card-static">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Compute Resources</h2>
          <div className="space-y-3">
            {computeSpecs.map((spec) => {
              const Icon = spec.icon;
              return (
                <div key={spec.label} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <Icon className="h-4 w-4 text-neutral-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-neutral-500">{spec.label}</p>
                    <p className="text-sm font-medium text-neutral-200">{spec.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="card-static">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Runtime Information</h2>
          <div className="space-y-3">
            {runtimeInfo.map((info) => {
              const Icon = info.icon;
              return (
                <div key={info.label} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <Icon className="h-4 w-4 text-neutral-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-neutral-500">{info.label}</p>
                    <p className={`text-sm font-medium text-neutral-200 ${info.mono ? "font-mono" : ""}`}>{info.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      <article className="card-static">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Disks</h2>
          <Link href={`/virtual-machines/${vm.id}/edit`} className="btn-ghost text-xs">
            <Pencil className="h-3.5 w-3.5" />
            Edit Hardware
          </Link>
        </div>
        <div className="space-y-2">
          {vm.diskVolumes.length ? (
            vm.diskVolumes.map((disk) => (
              <div
                key={disk.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-200">
                    {disk.name}
                    {disk.isBoot ? " (Boot)" : ""}
                  </p>
                  <p className="text-xs text-neutral-500">Pool: {disk.storagePool.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-neutral-200">{disk.sizeGb} GB</p>
                  <p className="text-xs text-neutral-500">{disk.format}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-neutral-500">No disk metadata available yet for this VM.</p>
          )}
        </div>
      </article>

      <VmScheduleEditor
        vmId={vm.id}
        value={{
          autoStopAt: vm.autoStopAt,
          expiresAt: vm.expiresAt,
          expirationAction: vm.expirationAction,
          lastAutomatedActionAt: vm.lastAutomatedActionAt
        }}
        onUpdated={patchLocalSchedule}
      />
    </section>
  );
}
