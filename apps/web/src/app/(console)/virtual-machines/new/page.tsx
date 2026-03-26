"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError, apiRequest } from "../../../../lib/api";
import { ArrowLeft, Cpu, MemoryStick, HardDrive, Server, Network, Disc, AlertTriangle, Clock3 } from "lucide-react";

type Host = {
  id: string;
  name: string;
  status: string;
};

type NetworkItem = {
  id: string;
  name: string;
  type: "BRIDGE" | "NAT" | "VLAN" | "INTERNAL";
  hostId: string | null;
};

type Iso = {
  id: string;
  name: string;
  version: string | null;
  osFamily: string | null;
  storagePool: {
    id: string;
    name: string;
    hostId: string;
  };
};

type TemplateItem = {
  id: string;
  name: string;
  version: string;
  defaultVcpu: number;
  defaultMemoryMb: number;
  defaultDiskGb: number;
  isoId: string | null;
};

type MePayload = {
  id: string;
  role: "ADMINISTRADOR" | "PROFESOR" | "ALUMNO";
};

export default function CreateVmPage() {
  const router = useRouter();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [networks, setNetworks] = useState<NetworkItem[]>([]);
  const [isos, setIsos] = useState<Iso[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [role, setRole] = useState<MePayload["role"] | null>(null);
  const [name, setName] = useState("");
  const [vcpu, setVcpu] = useState(2);
  const [memoryMb, setMemoryMb] = useState(4096);
  const [diskGb, setDiskGb] = useState(40);
  const [templateId, setTemplateId] = useState("");
  const [hostId, setHostId] = useState("");
  const [networkId, setNetworkId] = useState("");
  const [isoId, setIsoId] = useState("");
  const [autoStopAt, setAutoStopAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [expirationAction, setExpirationAction] = useState<"STOP" | "DELETE">("STOP");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isAlumno = role === "ALUMNO";

  useEffect(() => {
    void (async () => {
      try {
        const [hostList, networkList, isoList, templateList, me] = await Promise.all([
          apiRequest<Host[]>("/hypervisors"),
          apiRequest<NetworkItem[]>("/networks"),
          apiRequest<Iso[]>("/isos"),
          apiRequest<TemplateItem[]>("/templates"),
          apiRequest<MePayload>("/auth/me")
        ]);
        setHosts(hostList);
        setNetworks(networkList);
        setIsos(isoList);
        setTemplates(templateList);
        setRole(me.role);

        const firstHost = hostList.find((host) => host.status === "ONLINE") ?? hostList[0];
        if (firstHost) {
          setHostId(firstHost.id);
          const firstNetworkForHost = networkList.find((network) => !network.hostId || network.hostId === firstHost.id);
          setNetworkId(firstNetworkForHost?.id ?? "");
          const firstIsoForHost = isoList.find((iso) => iso.storagePool.hostId === firstHost.id);
          setIsoId(firstIsoForHost?.id ?? "");
        }
        if (templateList.length) {
          setTemplateId(templateList[0].id);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load configuration data");
      }
    })();
  }, []);

  const visibleNetworks = useMemo(() => {
    if (!hostId) return networks;
    return networks.filter((network) => !network.hostId || network.hostId === hostId);
  }, [hostId, networks]);

  const visibleIsos = useMemo(() => {
    if (!hostId) return isos;
    return isos.filter((iso) => iso.storagePool.hostId === hostId);
  }, [hostId, isos]);

  useEffect(() => {
    if (!hostId) {
      setNetworkId("");
      setIsoId("");
      return;
    }

    if (networkId && !visibleNetworks.some((network) => network.id === networkId)) {
      setNetworkId(visibleNetworks[0]?.id ?? "");
    }
    if (!networkId && visibleNetworks[0]) {
      setNetworkId(visibleNetworks[0].id);
    }
    if (isoId && !visibleIsos.some((iso) => iso.id === isoId)) {
      setIsoId(visibleIsos[0]?.id ?? "");
    }
    if (!isoId && visibleIsos[0]) {
      setIsoId(visibleIsos[0].id);
    }
  }, [hostId, isoId, networkId, visibleIsos, visibleNetworks]);

  useEffect(() => {
    if (!templateId) return;
    const selected = templates.find((template) => template.id === templateId);
    if (!selected) return;

    setVcpu(selected.defaultVcpu);
    setMemoryMb(selected.defaultMemoryMb);
    setDiskGb(selected.defaultDiskGb);
    if (selected.isoId) {
      setIsoId(selected.isoId);
    }
  }, [templateId, templates]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (!hostId) {
        throw new ApiError(400, "VALIDATION_ERROR", "Select an online hypervisor host first.");
      }
      if (isAlumno && !templateId) {
        throw new ApiError(400, "VALIDATION_ERROR", "Students must select an assigned template.");
      }
      if (vcpu < 1 || vcpu > 64) {
        throw new ApiError(400, "VALIDATION_ERROR", "vCPU must be between 1 and 64.");
      }
      if (memoryMb < 512) {
        throw new ApiError(400, "VALIDATION_ERROR", "Memory must be at least 512 MB.");
      }
      if (diskGb < 5) {
        throw new ApiError(400, "VALIDATION_ERROR", "Disk must be at least 5 GB.");
      }
      if (autoStopAt && expiresAt && new Date(expiresAt).getTime() < new Date(autoStopAt).getTime()) {
        throw new ApiError(400, "VALIDATION_ERROR", "Expiration must be after auto-stop.");
      }

      await apiRequest("/virtual-machines", {
        method: "POST",
        body: {
          name,
          vcpu: isAlumno ? undefined : vcpu,
          memoryMb: isAlumno ? undefined : memoryMb,
          diskGb: isAlumno ? undefined : diskGb,
          templateId: templateId || undefined,
          hostId,
          networkId: networkId || undefined,
          isoId: isAlumno ? undefined : isoId || undefined,
          autoStopAt: autoStopAt ? new Date(autoStopAt).toISOString() : undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          expirationAction
        }
      });
      router.replace("/virtual-machines");
    } catch (err) {
      if (err instanceof ApiError) {
        const enrichedMessage =
          err.code === "HYPERVISOR_UNAVAILABLE"
            ? `${err.message}. Check host connectivity, storage pool and ISO path on the selected hypervisor.`
            : err.message;
        setError(enrichedMessage);
      } else {
        setError("Failed to create VM");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="max-w-2xl space-y-6 animate-fade-in">
      <Link href="/virtual-machines" className="btn-ghost text-sm inline-flex">
        <ArrowLeft className="h-4 w-4" />
        Back to VMs
      </Link>

      <div className="page-header">
        <h1 className="page-title">Create Virtual Machine</h1>
        <p className="page-subtitle">Configure a new instance for your cloud lab</p>
      </div>

      {!hosts.length && (
        <div className="alert-warning flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No hypervisors found. <Link className="underline font-medium" href="/hypervisors">Register one first</Link>.
        </div>
      )}

      <form className="card-static space-y-6" onSubmit={onSubmit}>
        {/* Name */}
        <div>
          <label className="input-label" htmlFor="vm-name">Instance Name</label>
          <input
            id="vm-name"
            className="input"
            placeholder="my-vm-01"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        {/* Resources */}
        <div>
          <p className="text-sm font-semibold text-neutral-300 mb-3">Compute Resources</p>
          <div className="mb-3">
            <label className="input-label">Template</label>
            <select className="input" value={templateId} onChange={(event) => setTemplateId(event.target.value)} required={isAlumno}>
              {isAlumno ? (
                templates.length ? null : <option value="">No assigned templates</option>
              ) : (
                <option value="">No template</option>
              )}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} {template.version}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              {isAlumno
                ? "As ALUMNO, template selection is required and quotas are enforced (max 4 VMs, 6 vCPU, 6 GB RAM total)."
                : "Selecting a template pre-fills CPU, memory and disk defaults."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                vCPU
              </label>
              <input
                className="input"
                type="number"
                min={1}
                max={64}
                value={vcpu}
                onChange={(event) => setVcpu(Number(event.target.value))}
                disabled={isAlumno && Boolean(templateId)}
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
                min={512}
                step={512}
                value={memoryMb}
                onChange={(event) => setMemoryMb(Number(event.target.value))}
                disabled={isAlumno && Boolean(templateId)}
              />
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                Disk (GB)
              </label>
              <input
                className="input"
                type="number"
                min={5}
                value={diskGb}
                onChange={(event) => setDiskGb(Number(event.target.value))}
                disabled={isAlumno && Boolean(templateId)}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-white/[0.06]" />

        {/* Host */}
        <div>
          <label className="input-label flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />
            Hypervisor Host
          </label>
          <select className="input" value={hostId} onChange={(event) => setHostId(event.target.value)} required>
            <option value="">Select a host</option>
            {hosts
              .filter((host) => host.status === "ONLINE")
              .map((host) => (
                <option key={host.id} value={host.id}>
                  {host.name} (Online)
                </option>
              ))}
          </select>
        </div>

        {/* Network & ISO */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="input-label flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" />
              Network
            </label>
            <select className="input" value={networkId} onChange={(event) => setNetworkId(event.target.value)}>
              <option value="">No network</option>
              {visibleNetworks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name} ({network.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label flex items-center gap-1.5">
              <Disc className="h-3.5 w-3.5" />
              Boot ISO
            </label>
            <select className="input" value={isoId} onChange={(event) => setIsoId(event.target.value)} disabled={isAlumno}>
              <option value="">No ISO</option>
              {visibleIsos.map((iso) => (
                <option key={iso.id} value={iso.id}>
                  {iso.name}
                  {iso.version ? ` ${iso.version}` : ""}
                  {iso.osFamily ? ` (${iso.osFamily})` : ""}
                </option>
              ))}
            </select>
            {isAlumno && (
              <p className="mt-1 text-xs text-neutral-500">
                ISO is fixed by the selected template for ALUMNO users.
              </p>
            )}
          </div>
        </div>

        <div className="h-px bg-white/[0.06]" />

        {/* Scheduling */}
        <div>
          <p className="mb-3 text-sm font-semibold text-neutral-300">Automation Policy</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                Auto-stop at
              </label>
              <input className="input" type="datetime-local" value={autoStopAt} onChange={(event) => setAutoStopAt(event.target.value)} />
            </div>

            <div>
              <label className="input-label flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                Expire at
              </label>
              <input className="input" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </div>
          </div>

          <div className="mt-4">
            <label className="input-label">When expired</label>
            <select className="input" value={expirationAction} onChange={(event) => setExpirationAction(event.target.value as "STOP" | "DELETE")}>
              <option value="STOP">Stop VM</option>
              <option value="DELETE">Delete VM</option>
            </select>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Leave empty to disable automated scheduling.
          </p>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-neutral-500">
            Configure <Link className="text-indigo-400 hover:text-indigo-300" href="/networks">Networks</Link> and{" "}
            <Link className="text-indigo-400 hover:text-indigo-300" href="/isos">ISOs</Link> for more options.
            <br />
            Provisioning can take 30-90 seconds depending on storage and ISO size.
          </p>
          <button className="btn-primary" type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating...
              </>
            ) : (
              "Create Instance"
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
