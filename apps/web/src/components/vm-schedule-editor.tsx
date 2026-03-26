"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest } from "../lib/api";
import { VmScheduleBadge } from "./vm-schedule-badge";
import { Clock3, RefreshCw } from "lucide-react";

export type VmScheduleModel = {
  autoStopAt: string | null;
  expiresAt: string | null;
  expirationAction: "STOP" | "DELETE";
  lastAutomatedActionAt: string | null;
};

type Props = {
  vmId: string;
  value: VmScheduleModel;
  onUpdated: (next: VmScheduleModel) => void;
};

type SchedulerTickResponse = {
  processed: number;
  applied: number;
  failed: number;
  skippedActions: number;
  reason?: string;
};

export function VmScheduleEditor({ vmId, value, onUpdated }: Props) {
  const [autoStopInput, setAutoStopInput] = useState("");
  const [expiresInput, setExpiresInput] = useState("");
  const [expirationAction, setExpirationAction] = useState<"STOP" | "DELETE">("STOP");
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningScheduler, setIsRunningScheduler] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAutoStopInput(toDateTimeLocalInput(value.autoStopAt));
    setExpiresInput(toDateTimeLocalInput(value.expiresAt));
    setExpirationAction(value.expirationAction);
  }, [value.autoStopAt, value.expiresAt, value.expirationAction]);

  const canSave = useMemo(() => {
    return !isSaving && (autoStopInput !== toDateTimeLocalInput(value.autoStopAt) || expiresInput !== toDateTimeLocalInput(value.expiresAt) || expirationAction !== value.expirationAction);
  }, [autoStopInput, expirationAction, expiresInput, isSaving, value.autoStopAt, value.expiresAt, value.expirationAction]);

  const saveSchedule = async () => {
    setError(null);
    setFeedback(null);
    setIsSaving(true);
    try {
      const nextAutoStopIso = autoStopInput ? new Date(autoStopInput).toISOString() : null;
      const nextExpiresIso = expiresInput ? new Date(expiresInput).toISOString() : null;

      if (nextAutoStopIso && nextExpiresIso && new Date(nextExpiresIso).getTime() < new Date(nextAutoStopIso).getTime()) {
        throw new ApiError(400, "VALIDATION_ERROR", "expiresAt must be greater than or equal to autoStopAt");
      }

      const updated = await apiRequest<VmScheduleModel>(`/virtual-machines/${vmId}/schedule`, {
        method: "PATCH",
        body: {
          autoStopAt: nextAutoStopIso,
          expiresAt: nextExpiresIso,
          expirationAction
        }
      });
      onUpdated({
        autoStopAt: updated.autoStopAt,
        expiresAt: updated.expiresAt,
        expirationAction: updated.expirationAction,
        lastAutomatedActionAt: updated.lastAutomatedActionAt
      });
      setFeedback("Policy saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save policy");
    } finally {
      setIsSaving(false);
    }
  };

  const extendSchedule = async (target: "autoStopAt" | "expiresAt", minutes: number) => {
    setError(null);
    setFeedback(null);
    setIsSaving(true);
    try {
      const updated = await apiRequest<VmScheduleModel>(`/virtual-machines/${vmId}/schedule/extend`, {
        method: "POST",
        body: {
          target,
          minutes
        }
      });
      onUpdated({
        autoStopAt: updated.autoStopAt,
        expiresAt: updated.expiresAt,
        expirationAction: updated.expirationAction,
        lastAutomatedActionAt: updated.lastAutomatedActionAt
      });
      setFeedback(`Extended ${target} by ${minutes} minutes.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to extend ${target}`);
    } finally {
      setIsSaving(false);
    }
  };

  const runSchedulerNow = async () => {
    setError(null);
    setFeedback(null);
    setIsRunningScheduler(true);
    try {
      const result = await apiRequest<SchedulerTickResponse>("/virtual-machines/scheduler/run-now", {
        method: "POST",
        body: {}
      });
      const reasonText = result.reason ? ` (${result.reason})` : "";
      setFeedback(`Scheduler run complete: ${result.applied}/${result.processed} applied, ${result.failed} failed${reasonText}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to run scheduler now");
    } finally {
      setIsRunningScheduler(false);
    }
  };

  return (
    <article className="card-static space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Automation Policy</h2>
          <p className="mt-1 text-xs text-neutral-500">Set auto-stop and expiration rules for this VM.</p>
        </div>
        <button className="btn-secondary text-xs" disabled={isRunningScheduler} onClick={() => void runSchedulerNow()}>
          <RefreshCw className={`h-3.5 w-3.5 ${isRunningScheduler ? "animate-spin" : ""}`} />
          Run Scheduler Now
        </button>
      </div>

      <VmScheduleBadge autoStopAt={value.autoStopAt} expiresAt={value.expiresAt} expirationAction={value.expirationAction} compact />

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="input-label">Auto-stop at</label>
          <input className="input" type="datetime-local" value={autoStopInput} onChange={(event) => setAutoStopInput(event.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary !px-2.5 !py-1.5 text-xs" type="button" disabled={isSaving} onClick={() => void extendSchedule("autoStopAt", 30)}>
              +30m
            </button>
            <button className="btn-secondary !px-2.5 !py-1.5 text-xs" type="button" disabled={isSaving} onClick={() => void extendSchedule("autoStopAt", 120)}>
              +2h
            </button>
          </div>
        </div>

        <div>
          <label className="input-label">Expires at</label>
          <input className="input" type="datetime-local" value={expiresInput} onChange={(event) => setExpiresInput(event.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary !px-2.5 !py-1.5 text-xs" type="button" disabled={isSaving} onClick={() => void extendSchedule("expiresAt", 60)}>
              +1h
            </button>
            <button className="btn-secondary !px-2.5 !py-1.5 text-xs" type="button" disabled={isSaving} onClick={() => void extendSchedule("expiresAt", 240)}>
              +4h
            </button>
            <button className="btn-secondary !px-2.5 !py-1.5 text-xs" type="button" disabled={isSaving} onClick={() => void extendSchedule("expiresAt", 1440)}>
              +1d
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="input-label">Expiration action</label>
        <select className="input" value={expirationAction} onChange={(event) => setExpirationAction(event.target.value as "STOP" | "DELETE")}>
          <option value="STOP">Stop VM on expiration</option>
          <option value="DELETE">Delete VM on expiration</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
          <Clock3 className="h-3.5 w-3.5" />
          Last automated action: {value.lastAutomatedActionAt ? new Date(value.lastAutomatedActionAt).toLocaleString() : "never"}
        </p>
        <button className="btn-primary" disabled={!canSave} onClick={() => void saveSchedule()}>
          {isSaving ? "Saving..." : "Save Policy"}
        </button>
      </div>

      {feedback && <div className="alert-success">{feedback}</div>}
      {error && <div className="alert-error">{error}</div>}
    </article>
  );
}

function toDateTimeLocalInput(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (unit: number) => unit.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
