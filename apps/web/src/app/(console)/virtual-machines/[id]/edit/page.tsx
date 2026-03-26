"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest } from "../../../../../lib/api";
import { ArrowLeft, Cpu, HardDrive, MemoryStick, Save, PlusCircle, Layers, Network } from "lucide-react";

type VmDetail = {
  id: string;
  name: string;
  state: string;
  vcpu: number;
  memoryMb: number;
  diskGb: number;
  osType: string | null;
  network: {
    id: string;
    name: string;
    type: "BRIDGE" | "NAT" | "VLAN" | "INTERNAL";
  } | null;
  host: {
    id: string;
    name: string;
  };
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
};

type StoragePool = {
  id: string;
  name: string;
  hostId: string;
  status: string;
};

type NetworkItem = {
  id: string;
  name: string;
  type: "BRIDGE" | "NAT" | "VLAN" | "INTERNAL";
  hostId: string | null;
};

export default function EditVmPage() {
  const params = useParams<{ id: string }>();

  const [vm, setVm] = useState<VmDetail | null>(null);
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [networks, setNetworks] = useState<NetworkItem[]>([]);
  const [vcpu, setVcpu] = useState(1);
  const [memoryMb, setMemoryMb] = useState(1024);
  const [diskGb, setDiskGb] = useState(10);
  const [osType, setOsType] = useState("");
  const [networkId, setNetworkId] = useState("");

  const [newDiskSizeGb, setNewDiskSizeGb] = useState(20);
  const [newDiskPoolId, setNewDiskPoolId] = useState("");
  const [newDiskFormat, setNewDiskFormat] = useState<"qcow2" | "raw">("qcow2");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingDisk, setAddingDisk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadVm = async () => {
    const result = await apiRequest<VmDetail>(`/virtual-machines/${params.id}`);
    setVm(result);
    setVcpu(result.vcpu);
    setMemoryMb(result.memoryMb);
    setDiskGb(result.diskGb);
    setOsType(result.osType ?? "");
    setNetworkId(result.network?.id ?? "");
  };

  const loadPools = async () => {
    const storage = await apiRequest<StoragePool[]>("/storage");
    setPools(storage);
  };

  const loadNetworks = async () => {
    const networkList = await apiRequest<NetworkItem[]>("/networks");
    setNetworks(networkList);
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadVm(), loadPools(), loadNetworks()]);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load VM editor");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const hostPools = useMemo(() => {
    if (!vm) return [];
    return pools.filter((pool) => pool.hostId === vm.host.id);
  }, [pools, vm]);

  const hostNetworks = useMemo(() => {
    if (!vm) return [];
    return networks.filter((network) => !network.hostId || network.hostId === vm.host.id);
  }, [networks, vm]);

  useEffect(() => {
    if (!hostPools.length) {
      setNewDiskPoolId("");
      return;
    }
    if (!newDiskPoolId || !hostPools.some((pool) => pool.id === newDiskPoolId)) {
      setNewDiskPoolId(hostPools[0].id);
    }
  }, [hostPools, newDiskPoolId]);

  useEffect(() => {
    if (!vm) return;
    if (networkId && !hostNetworks.some((network) => network.id === networkId)) {
      setNetworkId("");
    }
  }, [hostNetworks, networkId, vm]);

  const saveHardware = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vm) return;

    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      if (vcpu < 1 || vcpu > 64) {
        throw new ApiError(400, "VALIDATION_ERROR", "vCPU must be between 1 and 64.");
      }
      if (memoryMb < 512) {
        throw new ApiError(400, "VALIDATION_ERROR", "Memory must be at least 512 MB.");
      }
      if (diskGb < vm.diskGb) {
        throw new ApiError(400, "VALIDATION_ERROR", "Primary disk cannot be reduced. Increase it only.");
      }

      const hardwarePayload: Record<string, number> = {};
      if (vcpu !== vm.vcpu) hardwarePayload.vcpu = vcpu;
      if (memoryMb !== vm.memoryMb) hardwarePayload.memoryMb = memoryMb;
      if (diskGb !== vm.diskGb) hardwarePayload.diskGb = diskGb;

      if (Object.keys(hardwarePayload).length > 0) {
        await apiRequest(`/virtual-machines/${vm.id}/hardware`, {
          method: "PATCH",
          body: hardwarePayload
        });
      }

      const normalizedOsType = osType.trim();
      const currentOsType = vm.osType ?? "";
      const currentNetworkId = vm.network?.id ?? "";
      const networkChanged = networkId !== currentNetworkId;

      if (normalizedOsType !== currentOsType || networkChanged) {
        await apiRequest(`/virtual-machines/${vm.id}`, {
          method: "PATCH",
          body: {
            osType: normalizedOsType || undefined,
            networkId: networkChanged ? networkId || null : undefined
          }
        });
      }

      if (Object.keys(hardwarePayload).length === 0 && normalizedOsType === currentOsType && !networkChanged) {
        setFeedback("No changes to apply.");
        return;
      }

      await loadVm();
      setFeedback("VM configuration updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save VM hardware");
    } finally {
      setSaving(false);
    }
  };

  const addDisk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vm) return;

    setAddingDisk(true);
    setError(null);
    setFeedback(null);

    try {
      if (newDiskSizeGb < 1) {
        throw new ApiError(400, "VALIDATION_ERROR", "Extra disk size must be at least 1 GB.");
      }

      await apiRequest(`/virtual-machines/${vm.id}/disks`, {
        method: "POST",
        body: {
          sizeGb: newDiskSizeGb,
          format: newDiskFormat,
          storagePoolId: newDiskPoolId || undefined
        }
      });
      await loadVm();
      setFeedback("Extra disk attached successfully.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add extra disk");
    } finally {
      setAddingDisk(false);
    }
  };

  if (loading && !vm) {
    return (
      <section className="space-y-4">
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-72 w-full" />
      </section>
    );
  }

  if (error && !vm) {
    return (
      <section className="space-y-4">
        <Link href="/virtual-machines" className="btn-ghost text-sm inline-flex">
          <ArrowLeft className="h-4 w-4" />
          Back to VMs
        </Link>
        <div className="alert-error">{error}</div>
      </section>
    );
  }

  if (!vm) {
    return null;
  }

  return (
    <section className="space-y-6 animate-fade-in">
      <Link href={`/virtual-machines/${vm.id}`} className="btn-ghost text-sm inline-flex">
        <ArrowLeft className="h-4 w-4" />
        Back to VM
      </Link>

      <div className="page-header mb-0">
        <h1 className="page-title">Edit {vm.name}</h1>
        <p className="page-subtitle">
          Update CPU, RAM, disk capacity and attach additional disks on host {vm.host.name}
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {feedback && <div className="alert-success">{feedback}</div>}

      <form className="card-static space-y-5" onSubmit={saveHardware}>
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Hardware</h2>
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
            />
          </div>
          <div>
            <label className="input-label flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              Primary Disk (GB)
            </label>
            <input
              className="input"
              type="number"
              min={vm.diskGb}
              value={diskGb}
              onChange={(event) => setDiskGb(Number(event.target.value))}
            />
            <p className="mt-1 text-xs text-neutral-500">Primary disk can only be increased.</p>
          </div>
        </div>

        <div>
          <label className="input-label flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            OS Type (optional)
          </label>
          <input
            className="input"
            placeholder="linux / windows / ubuntu-24.04..."
            value={osType}
            onChange={(event) => setOsType(event.target.value)}
          />
        </div>

        <div>
          <label className="input-label flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5" />
            Network
          </label>
          <select className="input" value={networkId} onChange={(event) => setNetworkId(event.target.value)}>
            <option value="">No network</option>
            {hostNetworks.map((network) => (
              <option key={network.id} value={network.id}>
                {network.name} ({network.type})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            Only networks available on host {vm.host.name} are shown.
          </p>
        </div>

        <div className="flex justify-end">
          <button className="btn-primary" type="submit" disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>

      <form className="card-static space-y-5" onSubmit={addDisk}>
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Add Extra Disk</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="input-label">Size (GB)</label>
            <input
              className="input"
              type="number"
              min={1}
              value={newDiskSizeGb}
              onChange={(event) => setNewDiskSizeGb(Number(event.target.value))}
            />
          </div>
          <div>
            <label className="input-label">Format</label>
            <select
              className="input"
              value={newDiskFormat}
              onChange={(event) => setNewDiskFormat(event.target.value as "qcow2" | "raw")}
            >
              <option value="qcow2">qcow2</option>
              <option value="raw">raw</option>
            </select>
          </div>
          <div>
            <label className="input-label">Storage Pool</label>
            <select className="input" value={newDiskPoolId} onChange={(event) => setNewDiskPoolId(event.target.value)}>
              {!hostPools.length && <option value="">No pool available</option>}
              {hostPools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name} ({pool.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="btn-secondary" type="submit" disabled={addingDisk || !hostPools.length}>
            <PlusCircle className="h-4 w-4" />
            {addingDisk ? "Adding Disk..." : "Attach Disk"}
          </button>
        </div>
      </form>

      <article className="card-static">
        <h2 className="mb-4 text-sm font-semibold text-neutral-400 uppercase tracking-wider">Current Disks</h2>
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
            <p className="text-sm text-neutral-500">No disks registered.</p>
          )}
        </div>
      </article>
    </section>
  );
}
