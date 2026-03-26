"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../../lib/api";
import { FileText, Filter, CheckCircle, XCircle, Clock } from "lucide-react";

type AuditLog = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  message: string | null;
  result: string;
  createdAt: string;
  actor: {
    email: string;
    name: string;
  } | null;
};

const resultColors: Record<string, string> = {
  SUCCESS: "text-emerald-400",
  FAILED: "text-rose-400",
  FAILURE: "text-rose-400",
  ERROR: "text-rose-400"
};

const resultIcons: Record<string, typeof CheckCircle> = {
  SUCCESS: CheckCircle,
  FAILED: XCircle,
  FAILURE: XCircle,
  ERROR: XCircle
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadLogs = async (query?: { action?: string; resourceType?: string }) => {
    const searchParams = new URLSearchParams();
    if (query?.action) searchParams.set("action", query.action);
    if (query?.resourceType) searchParams.set("resourceType", query.resourceType);

    const suffix = searchParams.size ? `?${searchParams.toString()}` : "";
    try {
      const result = await apiRequest<AuditLog[]>(`/audit-logs${suffix}`);
      setLogs(result);
      setError(null);
      setIsLoaded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit logs");
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const onFilter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadLogs({ action, resourceType });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Audit Logs</h1>
        <p className="page-subtitle">Track all actions performed on the platform</p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3" onSubmit={onFilter}>
        <div>
          <label className="input-label">Action</label>
          <input
            className="input w-48"
            placeholder="e.g. vm.create"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>
        <div>
          <label className="input-label">Resource Type</label>
          <input
            className="input w-48"
            placeholder="e.g. VM"
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
          />
        </div>
        <button className="btn-secondary" type="submit">
          <Filter className="h-4 w-4" />
          Filter
        </button>
      </form>

      {error && <div className="alert-error">{error}</div>}

      {/* Logs table */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Result</th>
              <th>Actor</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const ResultIcon = resultIcons[log.result] ?? Clock;
              const resultColor = resultColors[log.result] ?? "text-neutral-400";

              return (
                <tr key={log.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-neutral-500" />
                      <span className="text-xs text-neutral-400 whitespace-nowrap">{formatTime(log.createdAt)}</span>
                    </div>
                  </td>
                  <td>
                    <code className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                      {log.action}
                    </code>
                  </td>
                  <td>
                    <span className="text-neutral-300">{log.resourceType}</span>
                    {log.resourceId && (
                      <code className="ml-1.5 text-[10px] text-neutral-500">{log.resourceId.slice(0, 8)}</code>
                    )}
                  </td>
                  <td>
                    <div className={`flex items-center gap-1.5 ${resultColor}`}>
                      <ResultIcon className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">{log.result}</span>
                    </div>
                  </td>
                  <td>
                    {log.actor ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-neutral-400">
                          {log.actor.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-neutral-400">{log.actor.email}</span>
                      </div>
                    ) : (
                      <span className="text-neutral-500">System</span>
                    )}
                  </td>
                  <td className="text-xs text-neutral-500 max-w-xs truncate">{log.message ?? "-"}</td>
                </tr>
              );
            })}
            {isLoaded && !logs.length && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <FileText className="h-7 w-7" />
                    </div>
                    <p className="empty-state-title">No audit logs found</p>
                    <p className="empty-state-text">Actions will be recorded here as they occur.</p>
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
