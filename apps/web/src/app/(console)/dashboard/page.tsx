"use client";

import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../../lib/api";
import {
  Monitor,
  Play,
  Server,
  Wifi,
  Users,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity
} from "lucide-react";

type Summary = {
  totalVms: number;
  runningVms: number;
  totalHosts: number;
  onlineHosts: number;
  totalUsers: number;
};

type Resources = {
  cpuTotal: number;
  memoryTotalMb: number;
  storageTotalGb: number;
  vmCount: number;
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [resources, setResources] = useState<Resources | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [summaryResult, resourcesResult] = await Promise.all([
          apiRequest<Summary>("/dashboard/summary"),
          apiRequest<Resources>("/dashboard/resources")
        ]);
        setSummary(summaryResult);
        setResources(resourcesResult);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      }
    })();
  }, []);

  if (error) {
    return <div className="alert-error">{error}</div>;
  }

  if (!summary || !resources) {
    return (
      <section className="space-y-6">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Infrastructure overview and resource metrics</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-static">
              <div className="skeleton h-4 w-24 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-static">
              <div className="skeleton h-4 w-24 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const summaryCards = [
    { label: "Total VMs", value: summary.totalVms, icon: Monitor, color: "text-indigo-400", bg: "bg-indigo-500/10", borderColor: "border-indigo-500/20" },
    { label: "Running VMs", value: summary.runningVms, icon: Play, color: "text-emerald-400", bg: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
    { label: "Hypervisors", value: summary.totalHosts, icon: Server, color: "text-purple-400", bg: "bg-purple-500/10", borderColor: "border-purple-500/20" },
    { label: "Online Hosts", value: summary.onlineHosts, icon: Wifi, color: "text-cyan-400", bg: "bg-cyan-500/10", borderColor: "border-cyan-500/20" },
    { label: "Users", value: summary.totalUsers, icon: Users, color: "text-amber-400", bg: "bg-amber-500/10", borderColor: "border-amber-500/20" }
  ];

  const resourceCards = [
    {
      label: "CPU Cores",
      value: resources.cpuTotal,
      unit: "cores",
      icon: Cpu,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      borderColor: "border-indigo-500/20",
      percentage: Math.min(100, Math.round((resources.vmCount / Math.max(1, resources.cpuTotal)) * 100))
    },
    {
      label: "Memory",
      value: resources.memoryTotalMb >= 1024 ? (resources.memoryTotalMb / 1024).toFixed(1) : resources.memoryTotalMb,
      unit: resources.memoryTotalMb >= 1024 ? "GB" : "MB",
      icon: MemoryStick,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
      percentage: Math.min(100, Math.round((resources.vmCount * 4096) / Math.max(1, resources.memoryTotalMb) * 100))
    },
    {
      label: "Storage",
      value: resources.storageTotalGb >= 1024 ? (resources.storageTotalGb / 1024).toFixed(1) : resources.storageTotalGb,
      unit: resources.storageTotalGb >= 1024 ? "TB" : "GB",
      icon: HardDrive,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      borderColor: "border-cyan-500/20",
      percentage: Math.min(100, Math.round((resources.vmCount * 40) / Math.max(1, resources.storageTotalGb) * 100))
    },
    {
      label: "Active VMs",
      value: resources.vmCount,
      unit: "instances",
      icon: Activity,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
      percentage: Math.min(100, Math.round((resources.vmCount / Math.max(1, summary.totalVms || 1)) * 100))
    }
  ];

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Infrastructure overview and resource metrics</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 stagger-children">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="card group relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-white">{card.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.bg} border ${card.borderColor}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Resource cards with progress */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Resource Allocation</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 stagger-children">
          {resourceCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="card group">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{card.label}</p>
                    <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">
                      {card.value}
                      <span className="ml-1.5 text-sm font-normal text-neutral-500">{card.unit}</span>
                    </p>
                  </div>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg} border ${card.borderColor}`}>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </div>
                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-500">Estimated usage</span>
                    <span className="text-neutral-400 font-medium">{card.percentage}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${
                        card.percentage > 80 ? "bg-rose-500" : card.percentage > 50 ? "bg-amber-500" : "bg-indigo-500"
                      }`}
                      style={{ width: `${card.percentage}%` }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
