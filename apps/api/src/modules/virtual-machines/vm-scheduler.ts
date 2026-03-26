import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { runAutomatedVmAction, type AutomatedVmActionResult } from "./vm-actions.service.js";

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerRunning = false;

export type VmSchedulerTickResult = {
  startedAt: string;
  finishedAt: string;
  skipped: boolean;
  reason?: string;
  limit: number;
  dueExpiration: number;
  dueAutoStop: number;
  processed: number;
  applied: number;
  failed: number;
  skippedActions: number;
  actions: AutomatedVmActionResult[];
};

export function startVmScheduler(): void {
  if (!env.VM_SCHEDULER_ENABLED || schedulerTimer) {
    return;
  }

  console.log(`[vm-scheduler] started, interval=${env.VM_SCHEDULER_INTERVAL_MS}ms, batch=${env.VM_SCHEDULER_BATCH_SIZE}`);
  schedulerTimer = setInterval(() => {
    void runVmSchedulerTick();
  }, env.VM_SCHEDULER_INTERVAL_MS);

  void runVmSchedulerTick();
}

export function stopVmScheduler(): void {
  if (!schedulerTimer) {
    return;
  }
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

export async function runVmSchedulerTick(input: { limit?: number } = {}): Promise<VmSchedulerTickResult> {
  const startedAt = new Date();
  const limit = input.limit ?? env.VM_SCHEDULER_BATCH_SIZE;

  if (schedulerRunning) {
    return buildSummary({
      startedAt,
      skipped: true,
      reason: "already_running",
      limit,
      dueExpiration: 0,
      dueAutoStop: 0,
      actions: []
    });
  }

  schedulerRunning = true;
  try {
    const now = new Date();
    const dueExpiration = await prisma.virtualMachine.findMany({
      where: {
        deletedAt: null,
        state: {
          not: "DELETED"
        },
        expiresAt: {
          lte: now
        }
      },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
      take: limit,
      select: {
        id: true,
        expirationAction: true
      }
    });

    const remaining = Math.max(limit - dueExpiration.length, 0);
    const excludedVmIds = dueExpiration.map((vm) => vm.id);
    const dueAutoStop = remaining
      ? await prisma.virtualMachine.findMany({
          where: {
            deletedAt: null,
            state: {
              notIn: ["STOPPED", "DELETED"]
            },
            autoStopAt: {
              lte: now
            },
            ...(excludedVmIds.length
              ? {
                  id: {
                    notIn: excludedVmIds
                  }
                }
              : {})
          },
          orderBy: [{ autoStopAt: "asc" }, { createdAt: "asc" }],
          take: remaining,
          select: {
            id: true
          }
        })
      : [];

    const actions: AutomatedVmActionResult[] = [];
    for (const vm of dueExpiration) {
      const action = vm.expirationAction === "DELETE" ? "EXPIRE_DELETE" : "EXPIRE_STOP";
      actions.push(await runAutomatedVmAction(vm.id, action, now));
    }

    for (const vm of dueAutoStop) {
      actions.push(await runAutomatedVmAction(vm.id, "AUTO_STOP", now));
    }

    return buildSummary({
      startedAt,
      skipped: false,
      limit,
      dueExpiration: dueExpiration.length,
      dueAutoStop: dueAutoStop.length,
      actions
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scheduler error";
    console.error("[vm-scheduler] tick failed", error);
    return buildSummary({
      startedAt,
      skipped: false,
      reason: message,
      limit,
      dueExpiration: 0,
      dueAutoStop: 0,
      actions: []
    });
  } finally {
    schedulerRunning = false;
  }
}

function buildSummary(input: {
  startedAt: Date;
  skipped: boolean;
  reason?: string;
  limit: number;
  dueExpiration: number;
  dueAutoStop: number;
  actions: AutomatedVmActionResult[];
}): VmSchedulerTickResult {
  const finishedAt = new Date();
  const applied = input.actions.filter((action) => action.status === "applied").length;
  const failed = input.actions.filter((action) => action.status === "failed").length;
  const skippedActions = input.actions.filter((action) => action.status === "skipped").length;

  return {
    startedAt: input.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    skipped: input.skipped,
    reason: input.reason,
    limit: input.limit,
    dueExpiration: input.dueExpiration,
    dueAutoStop: input.dueAutoStop,
    processed: input.actions.length,
    applied,
    failed,
    skippedActions,
    actions: input.actions
  };
}
