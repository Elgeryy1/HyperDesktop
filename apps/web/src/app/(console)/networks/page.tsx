"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../../lib/api";
import { Network, Plus, ChevronDown, ChevronUp, Info, Settings2, Trash2 } from "lucide-react";

type NetworkItem = {
  id: string;
  name: string;
  type: "BRIDGE" | "NAT" | "VLAN" | "INTERNAL";
  cidr: string;
  gatewayIp: string | null;
  vlanId: number | null;
};

type Host = {
  id: string;
  name: string;
  status: string;
};

type NetworkType = NetworkItem["type"];

type SuggestedConfig = {
  cidr: string;
  gatewayIp?: string;
  vlanId?: number;
  explanation: string;
};

function getSuggestedConfig(type: NetworkType): SuggestedConfig {
  if (type === "NAT") {
    return {
      cidr: "10.60.X.0/24 (auto)",
      gatewayIp: "10.60.X.1 (auto)",
      explanation: "Private network with NAT. Ideal for isolated labs with internet access."
    };
  }
  if (type === "BRIDGE") {
    return {
      cidr: "192.168.X.0/24 (auto)",
      gatewayIp: "192.168.X.1 (auto)",
      explanation: "Bridges VMs to the host network transparently."
    };
  }
  if (type === "INTERNAL") {
    return {
      cidr: "10.70.X.0/24 (auto)",
      gatewayIp: "10.70.X.1 (auto)",
      explanation: "Isolated network without external connectivity."
    };
  }
  return {
    cidr: "10.<vlan>.0.0/24 (auto)",
    gatewayIp: "10.<vlan>.0.1 (auto)",
    vlanId: 100,
    explanation: "VLAN-segmented network with custom VLAN ID."
  };
}

const typeColors: Record<string, string> = {
  NAT: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
  BRIDGE: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  INTERNAL: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  VLAN: "border-purple-500/20 bg-purple-500/10 text-purple-400"
};

export default function NetworksPage() {
  const [networks, setNetworks] = useState<NetworkItem[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "NAT" as NetworkItem["type"],
    cidr: "10.10.0.0/24",
    gatewayIp: "10.10.0.1",
    vlanId: "",
    hostId: ""
  });

  const loadData = async () => {
    try {
      const [networkList, hostList] = await Promise.all([
        apiRequest<NetworkItem[]>("/networks"),
        apiRequest<Host[]>("/hypervisors")
      ]);
      setNetworks(networkList);
      setHosts(hostList);
      setError(null);
      const firstOnline = hostList.find((h) => h.status === "ONLINE");
      if (firstOnline && !form.hostId) {
        setForm((prev) => ({ ...prev, hostId: firstOnline.id }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load networks");
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest("/networks", {
        method: "POST",
        body: {
          name: form.name,
          type: form.type,
          autoConfigure: !advancedMode,
          cidr: advancedMode ? form.cidr : undefined,
          gatewayIp: advancedMode ? form.gatewayIp || undefined : undefined,
          vlanId: advancedMode && form.type === "VLAN" && form.vlanId ? Number(form.vlanId) : undefined,
          hostId: form.hostId || undefined
        }
      });

      setForm({
        name: "",
        type: "NAT",
        cidr: "10.10.0.0/24",
        gatewayIp: "10.10.0.1",
        vlanId: "",
        hostId: form.hostId
      });
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create network");
    } finally {
      setIsSubmitting(false);
    }
  };

  const suggested = getSuggestedConfig(form.type);

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Networks</h1>
          <p className="page-subtitle">Configure virtual networks for your infrastructure</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)} type="button">
          {showForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Close" : "Create Network"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form className="card-static animate-fade-in space-y-4" onSubmit={onSubmit}>
          <h3 className="text-sm font-semibold text-neutral-300">New Network</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="input-label">Network Name</label>
              <input
                className="input"
                placeholder="lab-network-01"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="input-label">Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as NetworkItem["type"] }))}
              >
                <option value="NAT">NAT</option>
                <option value="BRIDGE">Bridge</option>
                <option value="INTERNAL">Internal</option>
                <option value="VLAN">VLAN</option>
              </select>
            </div>
          </div>

          <div>
            <label className="input-label">Host Binding</label>
            <select className="input" value={form.hostId} onChange={(event) => setForm((prev) => ({ ...prev, hostId: event.target.value }))}>
              <option value="">No host binding</option>
              {hosts
                .filter((host) => host.status === "ONLINE")
                .map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Auto config info */}
          <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 p-4 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-indigo-400" />
              <p className="font-medium text-indigo-300">Auto Configuration</p>
            </div>
            <p className="text-neutral-400">{suggested.explanation}</p>
            <div className="mt-2 flex gap-4 text-xs text-neutral-500">
              <span>CIDR: <span className="text-neutral-400">{suggested.cidr}</span></span>
              <span>Gateway: <span className="text-neutral-400">{suggested.gatewayIp ?? "auto"}</span></span>
              {form.type === "VLAN" && <span>VLAN ID: <span className="text-neutral-400">auto</span></span>}
            </div>
          </div>

          {/* Advanced toggle */}
          <label className="inline-flex items-center gap-2 text-sm text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={advancedMode}
              onChange={(event) => setAdvancedMode(event.target.checked)}
              className="rounded border-white/20 bg-white/5"
            />
            <Settings2 className="h-3.5 w-3.5" />
            Advanced mode (manual configuration)
          </label>

          {advancedMode && (
            <div className="grid gap-4 md:grid-cols-2 animate-fade-in-fast">
              <div>
                <label className="input-label">CIDR</label>
                <input
                  className="input"
                  placeholder="10.10.0.0/24"
                  value={form.cidr}
                  onChange={(event) => setForm((prev) => ({ ...prev, cidr: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="input-label">Gateway IP</label>
                <input
                  className="input"
                  placeholder="10.10.0.1"
                  value={form.gatewayIp}
                  onChange={(event) => setForm((prev) => ({ ...prev, gatewayIp: event.target.value }))}
                />
              </div>
              {form.type === "VLAN" && (
                <div className="md:col-span-2">
                  <label className="input-label">VLAN ID</label>
                  <input
                    className="input"
                    placeholder="100"
                    value={form.vlanId}
                    onChange={(event) => setForm((prev) => ({ ...prev, vlanId: event.target.value }))}
                  />
                </div>
              )}
            </div>
          )}

          <button className="btn-primary w-full justify-center" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Network"}
          </button>
        </form>
      )}

      {error && <div className="alert-error">{error}</div>}

      {/* Networks table */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>CIDR</th>
              <th>Gateway</th>
              <th>VLAN ID</th>
            </tr>
          </thead>
          <tbody>
            {networks.map((network) => (
              <tr key={network.id}>
                <td className="font-medium text-neutral-200">{network.name}</td>
                <td>
                  <span className={`badge border ${typeColors[network.type] ?? "border-neutral-500/20 bg-neutral-500/10 text-neutral-400"}`}>
                    {network.type}
                  </span>
                </td>
                <td><code className="text-xs text-neutral-400">{network.cidr}</code></td>
                <td><code className="text-xs text-neutral-400">{network.gatewayIp ?? "-"}</code></td>
                <td className="text-neutral-400">{network.vlanId ?? "-"}</td>
              </tr>
            ))}
            {!networks.length && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <Network className="h-7 w-7" />
                    </div>
                    <p className="empty-state-title">No networks configured</p>
                    <p className="empty-state-text">Create a virtual network to connect your instances.</p>
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
