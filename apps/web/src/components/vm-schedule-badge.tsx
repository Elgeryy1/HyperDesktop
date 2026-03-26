"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

type Props = {
  autoStopAt?: string | null;
  expiresAt?: string | null;
  expirationAction?: "STOP" | "DELETE" | null;
  compact?: boolean;
};

type PolicyChip = {
  id: "autoStop" | "expires";
  label: string;
  when: Date;
  tone: "neutral" | "warning" | "danger";
};

export function VmScheduleBadge({ autoStopAt, expiresAt, expirationAction = "STOP", compact = false }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const chips = useMemo<PolicyChip[]>(() => {
    const list: PolicyChip[] = [];
    if (autoStopAt) {
      const parsed = new Date(autoStopAt);
      if (!Number.isNaN(parsed.getTime())) {
        list.push({
          id: "autoStop",
          label: "Auto-stop",
          when: parsed,
          tone: "warning"
        });
      }
    }

    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (!Number.isNaN(parsed.getTime())) {
        list.push({
          id: "expires",
          label: expirationAction === "DELETE" ? "Expire-delete" : "Expire-stop",
          when: parsed,
          tone: expirationAction === "DELETE" ? "danger" : "warning"
        });
      }
    }

    return list;
  }, [autoStopAt, expiresAt, expirationAction]);

  if (!chips.length) {
    return <span className="badge border border-white/10 bg-white/[0.03] text-neutral-500">No policy</span>;
  }

  return (
    <div className={clsx("flex gap-1.5", compact ? "flex-col items-start" : "flex-wrap items-center")}>
      {chips.map((chip) => {
        const isLate = chip.when.getTime() <= now;
        const tone = isLate ? "danger" : chip.tone;
        return (
          <span
            key={chip.id}
            className={clsx(
              "inline-flex min-w-[132px] flex-col rounded-lg border px-2.5 py-1 text-left text-[11px] leading-tight",
              toneStyles[tone]
            )}
          >
            <span className="font-semibold uppercase tracking-wide">{chip.label}</span>
            <span className="mt-0.5 text-[10px]">
              {isLate ? "Due now" : formatRemaining(chip.when.getTime() - now)} · {chip.when.toLocaleString()}
            </span>
          </span>
        );
      })}
    </div>
  );
}

const toneStyles: Record<PolicyChip["tone"], string> = {
  neutral: "border-white/10 bg-white/[0.03] text-neutral-400",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/20 bg-red-500/10 text-red-300"
};

function formatRemaining(diffMs: number): string {
  const totalMinutes = Math.max(Math.floor(diffMs / 60_000), 0);
  if (totalMinutes < 60) {
    return `in ${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return `in ${totalHours}h`;
  }

  const totalDays = Math.floor(totalHours / 24);
  return `in ${totalDays}d`;
}
