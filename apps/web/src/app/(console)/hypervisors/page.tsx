"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest } from "../../../lib/api";
import { StateBadge } from "../../../components/state-badge";
import {
  Server,
  Plus,
  Cpu,
  MemoryStick,
  HardDrive,
  Link2,
  Activity,
  ChevronUp,
  Trash2,
  Sparkles,
  ShieldCheck
} from "lucide-react";

type Hypervisor = {
  id: string;
  name: string;
  providerType: "MOCK" | "LIBVIRT";
  status: string;
  connectionUri: string;
  cpuCoresTotal: number;
  memoryMbTotal: number;
  storageGbTotal: number;
};

type ProviderType = "MOCK" | "LIBVIRT";
type ConnectionPreset = "MOCK_LOCAL" | "LOCAL_SYSTEM" | "LOCAL_SESSION" | "SSH_SYSTEM" | "SSH_SESSION";

type RegisterFormState = {
  name: string;
  providerType: ProviderType;
  connectionPreset: ConnectionPreset;
  remoteHost: string;
  remoteUser: string;
  cpuCoresTotal: number;
  memoryMbTotal: number;
  storageGbTotal: number;
  useCustomUri: boolean;
  customUri: string;
};

const defaultRegisterForm: RegisterFormState = {
  name: "",
  providerType: "LIBVIRT",
  connectionPreset: "LOCAL_SYSTEM",
  remoteHost: "",
  remoteUser: "root",
  cpuCoresTotal: 16,
  memoryMbTotal: 32768,
  storageGbTotal: 1024,
  useCustomUri: false,
  customUri: ""
};

export default function HypervisorsPage() {
  const [hosts, setHosts] = useState<Hypervisor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RegisterFormState>(defaultRegisterForm);

  const isSshPreset = form.connectionPreset === "SSH_SYSTEM" || form.connectionPreset === "SSH_SESSION";
  const previewConnectionUri = useMemo(() => buildConnectionUri(form), [form]);

  const loadHosts = async () => {
    try {
      const result = await apiRequest<Hypervisor[]>("/hypervisors");
      setHosts(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load hypervisors");
    }
  };

  useEffect(() => {
    void loadHosts();
  }, []);

  const registerHost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (form.name.trim().length < 1) {
        setError("Hypervisor name is required.");
        return;
      }
      if (form.cpuCoresTotal < 1) {
        setError("CPU cores must be at least 1.");
        return;
      }
      if (form.memoryMbTotal < 1024) {
        setError("Memory must be at least 1024 MB.");
        return;
      }
      if (form.storageGbTotal < 20) {
        setError("Storage must be at least 20 GB.");
        return;
      }

      const connectionUri = buildConnectionUri(form);
      if (requiresExplicitUri(form) && !connectionUri) {
        setError("Connection profile is incomplete. Fill host/user for SSH.");
        return;
      }

      await apiRequest("/hypervisors", {
        method: "POST",
        body: {
          name: form.name.trim(),
          providerType: form.providerType,
          connectionUri: requiresExplicitUri(form) ? connectionUri : undefined,
          cpuCoresTotal: form.cpuCoresTotal,
          memoryMbTotal: form.memoryMbTotal,
          storageGbTotal: form.storageGbTotal
        }
      });

      setForm(defaultRegisterForm);
      setShowForm(false);
      await loadHosts();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details && typeof err.details === "object") {
          const flattened = err.details as { fieldErrors?: Record<string, string[]> };
          const firstField = flattened.fieldErrors ? Object.keys(flattened.fieldErrors)[0] : null;
          const firstMessage =
            firstField && flattened.fieldErrors?.[firstField]?.length
              ? `${firstField}: ${flattened.fieldErrors[firstField][0]}`
              : err.message;
          setError(firstMessage);
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to register host");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const probeHost = async (hostId: string) => {
    setProbingId(hostId);
    setError(null);
    try {
      const result = await apiRequest<{ ok: boolean; message: string }>("/hypervisors/" + hostId + "/actions/probe", {
        method: "POST"
      });
      if (!result.ok) setError(result.message);
      await loadHosts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to probe hypervisor");
    } finally {
      setProbingId(null);
    }
  };

  const deleteHost = async (hostId: string, hostName: string) => {
    const confirmed = window.confirm(`Delete hypervisor "${hostName}"?\n\nThis removes the host record from HyperDesk.`);
    if (!confirmed) {
      return;
    }

    setDeletingId(hostId);
    setError(null);
    try {
      await apiRequest(`/hypervisors/${hostId}`, { method: "DELETE" });
      await loadHosts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete hypervisor");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Hypervisors</h1>
          <p className="page-subtitle">Register and manage virtualization hosts</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)} type="button">
          {showForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Close" : "Register Host"}
        </button>
      </div>

      {showForm && (
        <form className="card-static animate-fade-in space-y-5" onSubmit={registerHost}>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-neutral-300">Register New Hypervisor</h3>
            <p className="text-xs text-neutral-500">Flujo simple: elige proveedor, perfil de conexión y pulsa Create.</p>
          </div>

          <div>
            <label className="input-label">Name</label>
            <input
              className="input"
              placeholder="lab-host-01"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>

          <div>
            <label className="input-label">Provider</label>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    providerType: "LIBVIRT",
                    connectionPreset: normalizePresetForProvider("LIBVIRT", prev.connectionPreset)
                  }))
                }
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  form.providerType === "LIBVIRT"
                    ? "border-indigo-500/40 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.25)_inset]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                }`}
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
                  <ShieldCheck className="h-4 w-4 text-indigo-300" />
                  LIBVIRT
                </p>
                <p className="mt-1 text-xs text-neutral-400">Producción con hypervisor real</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    providerType: "MOCK",
                    connectionPreset: "MOCK_LOCAL"
                  }))
                }
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  form.providerType === "MOCK"
                    ? "border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.25)_inset]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                }`}
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  MOCK
                </p>
                <p className="mt-1 text-xs text-neutral-400">Demo y desarrollo rápido</p>
              </button>
            </div>
          </div>

          {form.providerType === "LIBVIRT" && (
            <>
              <div>
                <label className="input-label">Perfil de conexión</label>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    {
                      id: "LOCAL_SYSTEM" as ConnectionPreset,
                      title: "Servidor local",
                      desc: "Misma máquina que ejecuta HyperDesk (recomendado)",
                      hint: "qemu:///system"
                    },
                    {
                      id: "SSH_SYSTEM" as ConnectionPreset,
                      title: "Remoto SSH (system)",
                      desc: "Producción con privilegios de sistema",
                      hint: "qemu+ssh://user@host/system"
                    },
                    {
                      id: "SSH_SESSION" as ConnectionPreset,
                      title: "Remoto SSH (session)",
                      desc: "Remoto sin root",
                      hint: "qemu+ssh://user@host/session"
                    }
                  ].map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, connectionPreset: profile.id }))}
                      className={`rounded-xl border px-3 py-3 text-left transition-all ${
                        form.connectionPreset === profile.id
                          ? "border-indigo-500/40 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.25)_inset]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                      }`}
                    >
                      <p className="text-sm font-semibold text-neutral-100">{profile.title}</p>
                      <p className="mt-1 text-xs text-neutral-400">{profile.desc}</p>
                      <p className="mt-2 rounded bg-black/20 px-1.5 py-1 text-[10px] text-neutral-400">{profile.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              {isSshPreset && (
                <div className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-2">
                  <div>
                    <label className="input-label">Host remoto</label>
                    <input
                      className="input"
                      placeholder="hypervisor.company.local"
                      value={form.remoteHost}
                      onChange={(event) => setForm((prev) => ({ ...prev, remoteHost: event.target.value }))}
                      required={isSshPreset}
                    />
                  </div>
                  <div>
                    <label className="input-label">Usuario SSH</label>
                    <input
                      className="input"
                      placeholder="root"
                      value={form.remoteUser}
                      onChange={(event) => setForm((prev) => ({ ...prev, remoteUser: event.target.value }))}
                      required={isSshPreset}
                    />
                  </div>
                  <p className="md:col-span-2 text-xs text-neutral-500">
                    Introduce el mismo host/usuario que ya tengas accesible por SSH desde el servidor API.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Resumen de conexión</p>
            <code className="mt-1 block break-all rounded bg-black/25 px-2 py-1.5 text-xs text-neutral-300">
              {previewConnectionUri || "Usará la URI por defecto del servidor API (recomendado para este PC)"}
            </code>
            <button
              className="mt-2 text-xs text-indigo-300 transition-colors hover:text-indigo-200"
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, useCustomUri: !prev.useCustomUri }))}
            >
              {form.useCustomUri ? "Ocultar modo avanzado" : "Modo avanzado: editar URI manualmente"}
            </button>
          </div>

          {form.useCustomUri && (
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Custom Connection URI (Advanced)
              </label>
              <input
                className="input"
                placeholder="qemu+ssh://root@hypervisor.company.local/system"
                value={form.customUri}
                onChange={(event) => setForm((prev) => ({ ...prev, customUri: event.target.value }))}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                CPU Cores
              </label>
              <input
                className="input"
                type="number"
                min={1}
                value={form.cpuCoresTotal}
                onChange={(event) => setForm((prev) => ({ ...prev, cpuCoresTotal: Number(event.target.value) }))}
                required
              />
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5">
                <MemoryStick className="h-3.5 w-3.5" />
                Memory (MB)
              </label>
              <input
                className="input"
                type="number"
                min={1024}
                value={form.memoryMbTotal}
                onChange={(event) => setForm((prev) => ({ ...prev, memoryMbTotal: Number(event.target.value) }))}
                required
              />
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                Storage (GB)
              </label>
              <input
                className="input"
                type="number"
                min={20}
                value={form.storageGbTotal}
                onChange={(event) => setForm((prev) => ({ ...prev, storageGbTotal: Number(event.target.value) }))}
                required
              />
            </div>
          </div>

          <button className="btn-primary w-full justify-center" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Hypervisor"}
          </button>
        </form>
      )}

      {error && <div className="alert-error">{error}</div>}

      {hosts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hosts.map((host) => (
            <article key={host.id} className="card-static">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10">
                    <Server className="h-5 w-5 text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{host.name}</h3>
                    <p className="text-xs text-neutral-500">{host.providerType}</p>
                  </div>
                </div>
                <StateBadge state={host.status} />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-neutral-500" /> CPU
                  </span>
                  <span className="font-medium text-neutral-200">{host.cpuCoresTotal} cores</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <MemoryStick className="h-3.5 w-3.5 text-neutral-500" /> Memory
                  </span>
                  <span className="font-medium text-neutral-200">
                    {host.memoryMbTotal >= 1024 ? `${(host.memoryMbTotal / 1024).toFixed(1)} GB` : `${host.memoryMbTotal} MB`}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-neutral-500" /> Storage
                  </span>
                  <span className="font-medium text-neutral-200">{host.storageGbTotal} GB</span>
                </div>
                <div className="flex flex-col gap-1 text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-neutral-500" /> URI
                  </span>
                  <code className="break-all rounded bg-white/[0.03] px-1.5 py-0.5 text-xs text-neutral-400">{host.connectionUri}</code>
                </div>
              </div>

              <div className="mt-4 border-t border-white/[0.05] pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="btn-secondary w-full justify-center"
                    type="button"
                    onClick={() => void probeHost(host.id)}
                    disabled={probingId === host.id || deletingId === host.id}
                  >
                    <Activity className="h-4 w-4" />
                    {probingId === host.id ? "Probing..." : "Probe"}
                  </button>
                  <button
                    className="btn-danger w-full justify-center"
                    type="button"
                    onClick={() => void deleteHost(host.id, host.name)}
                    disabled={probingId === host.id || deletingId === host.id}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingId === host.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card-static">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Server className="h-7 w-7" />
            </div>
            <p className="empty-state-title">No hypervisors registered</p>
            <p className="empty-state-text">Register a hypervisor host to start creating virtual machines.</p>
            {!showForm && (
              <button className="btn-primary mt-4" onClick={() => setShowForm(true)} type="button">
                <Plus className="h-4 w-4" />
                Register Host
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function normalizePresetForProvider(providerType: ProviderType, preset: ConnectionPreset): ConnectionPreset {
  if (providerType === "MOCK") {
    return "MOCK_LOCAL";
  }

  if (preset === "MOCK_LOCAL") {
    return "LOCAL_SYSTEM";
  }

  return preset;
}

function buildConnectionUri(form: RegisterFormState): string {
  if (form.useCustomUri && form.customUri.trim().length >= 2) {
    return form.customUri.trim();
  }

  if (form.providerType === "MOCK") {
    return "mock://local";
  }

  switch (form.connectionPreset) {
    case "LOCAL_SYSTEM":
      return "";
    case "LOCAL_SESSION":
      return "qemu:///session";
    case "SSH_SYSTEM": {
      const host = form.remoteHost.trim();
      const user = form.remoteUser.trim() || "root";
      return host ? `qemu+ssh://${user}@${host}/system` : "";
    }
    case "SSH_SESSION": {
      const host = form.remoteHost.trim();
      const user = form.remoteUser.trim() || "root";
      return host ? `qemu+ssh://${user}@${host}/session` : "";
    }
    case "MOCK_LOCAL":
      return "mock://local";
    default:
      return "";
  }
}

function requiresExplicitUri(form: RegisterFormState): boolean {
  if (form.useCustomUri) {
    return true;
  }

  if (form.providerType === "MOCK") {
    return false;
  }

  return form.connectionPreset !== "LOCAL_SYSTEM";
}
