import clsx from "clsx";

type Props = {
  state: string;
};

const stateConfig: Record<string, { dot: string; badge: string; glow?: boolean }> = {
  ONLINE: {
    dot: "bg-emerald-400",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    glow: true
  },
  OFFLINE: {
    dot: "bg-rose-400",
    badge: "border-rose-500/20 bg-rose-500/10 text-rose-400"
  },
  MAINTENANCE: {
    dot: "bg-amber-400",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-400"
  },
  PROVISIONING: {
    dot: "bg-indigo-400",
    badge: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
    glow: true
  },
  RUNNING: {
    dot: "bg-emerald-400",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    glow: true
  },
  STOPPED: {
    dot: "bg-neutral-500",
    badge: "border-neutral-500/20 bg-neutral-500/10 text-neutral-400"
  },
  ERROR: {
    dot: "bg-rose-400",
    badge: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    glow: true
  },
  CREATING: {
    dot: "bg-indigo-400",
    badge: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
    glow: true
  },
  STARTING: {
    dot: "bg-amber-400",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    glow: true
  },
  STOPPING: {
    dot: "bg-amber-400",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    glow: true
  },
  REBOOTING: {
    dot: "bg-amber-400",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    glow: true
  },
  DELETING: {
    dot: "bg-rose-400",
    badge: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    glow: true
  },
  DELETED: {
    dot: "bg-neutral-500",
    badge: "border-neutral-500/20 bg-neutral-500/10 text-neutral-400"
  }
};

const defaultConfig = {
  dot: "bg-amber-400",
  badge: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  glow: false
};

export function StateBadge({ state }: Props) {
  const normalized = state.toUpperCase();
  const config = stateConfig[normalized] ?? defaultConfig;

  return (
    <span
      className={clsx(
        "badge border",
        config.badge
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {config.glow && (
          <span className={clsx("absolute inset-0 rounded-full animate-ping opacity-50", config.dot)} />
        )}
        <span className={clsx("relative inline-flex h-1.5 w-1.5 rounded-full", config.dot)} />
      </span>
      {normalized}
    </span>
  );
}
