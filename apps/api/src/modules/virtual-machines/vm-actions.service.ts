import type { AuditActionResult, HypervisorProviderType, Prisma, VmState } from "@prisma/client";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getHypervisorProvider } from "./providers/factory.js";

const provider = getHypervisorProvider();

type AutomatedVmAction = "AUTO_STOP" | "EXPIRE_STOP" | "EXPIRE_DELETE";

export type AutomatedVmActionResult = {
  vmId: string;
  action: AutomatedVmAction;
  status: "applied" | "skipped" | "failed";
  reason: string;
};

type VmWithHost = {
  id: string;
  name: string;
  state: VmState;
  externalId: string | null;
  ipAddress: string | null;
  autoStopAt: Date | null;
  expiresAt: Date | null;
  expirationAction: "STOP" | "DELETE";
  deletedAt: Date | null;
  host: {
    name: string;
    connectionUri: string;
    providerType: HypervisorProviderType;
  };
};

type ScheduleUpdateData = {
  autoStopAt?: Date | null;
  expiresAt?: Date | null;
};

type ActionMeta = {
  auditAction: AutomatedVmAction;
  message: string;
  schedulePatch: ScheduleUpdateData;
};

export function ensureHostProviderMatches(providerType: HypervisorProviderType): void {
  if (env.HYPERVISOR_PROVIDER === "mock" && providerType !== "MOCK") {
    throw new HttpError(400, "VALIDATION_ERROR", "VM is attached to a LIBVIRT host but API is in MOCK mode");
  }
  if (env.HYPERVISOR_PROVIDER === "libvirt" && providerType !== "LIBVIRT") {
    throw new HttpError(400, "VALIDATION_ERROR", "VM is attached to a MOCK host but API is in LIBVIRT mode");
  }
}

export async function runAutomatedVmAction(vmId: string, action: AutomatedVmAction, now = new Date()): Promise<AutomatedVmActionResult> {
  const vm = await prisma.virtualMachine.findUnique({
    where: { id: vmId },
    include: {
      host: {
        select: {
          name: true,
          connectionUri: true,
          providerType: true
        }
      }
    }
  });

  if (!vm) {
    return {
      vmId,
      action,
      status: "skipped",
      reason: "not_found"
    };
  }

  if (vm.deletedAt || vm.state === "DELETED") {
    return {
      vmId,
      action,
      status: "skipped",
      reason: "already_deleted"
    };
  }

  try {
    ensureHostProviderMatches(vm.host.providerType);
  } catch {
    await writeAutomationAudit(vm, action, "Scheduler skipped VM because host provider does not match API mode", "FAILED", {
      reason: "provider_mismatch",
      providerType: vm.host.providerType,
      apiProviderMode: env.HYPERVISOR_PROVIDER
    });

    return {
      vmId,
      action,
      status: "skipped",
      reason: "provider_mismatch"
    };
  }

  try {
    const meta = getActionMeta(action, vm.name);
    if (action === "EXPIRE_DELETE") {
      await applyAutomatedDelete(vm, meta, now);
    } else {
      await applyAutomatedStop(vm, meta, now);
    }

    return {
      vmId,
      action,
      status: "applied",
      reason: "ok"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scheduler error";
    await writeAutomationAudit(vm, action, message, "FAILED", {
      reason: "provider_error",
      errorMessage: message
    });

    return {
      vmId,
      action,
      status: "failed",
      reason: message
    };
  }
}

async function applyAutomatedStop(vm: VmWithHost, meta: ActionMeta, now: Date): Promise<void> {
  let nextState: VmState = vm.state;
  let nextIpAddress: string | null = vm.state === "RUNNING" ? vm.ipAddress : null;

  if (vm.state !== "STOPPED") {
    if (vm.externalId) {
      const providerVm = await provider.stopVm(vm.externalId, {
        hostName: vm.host.name,
        connectionUri: vm.host.connectionUri
      });
      nextState = providerVm.state as VmState;
      nextIpAddress = nextState === "RUNNING" ? providerVm.ipAddress ?? vm.ipAddress : null;
    } else {
      nextState = "STOPPED";
      nextIpAddress = null;
    }
  }

  await prisma.virtualMachine.update({
    where: { id: vm.id },
    data: {
      state: nextState,
      ipAddress: nextIpAddress,
      lastAutomatedActionAt: now,
      ...meta.schedulePatch
    }
  });

  await writeAutomationAudit(vm, meta.auditAction, meta.message, "SUCCESS", {
    previousState: vm.state,
    nextState
  });
}

async function applyAutomatedDelete(vm: VmWithHost, meta: ActionMeta, now: Date): Promise<void> {
  if (vm.externalId) {
    await provider.deleteVm(vm.externalId, {
      hostName: vm.host.name,
      connectionUri: vm.host.connectionUri
    });
  }

  await prisma.virtualMachine.update({
    where: { id: vm.id },
    data: {
      state: "DELETED",
      ipAddress: null,
      deletedAt: now,
      lastAutomatedActionAt: now,
      ...meta.schedulePatch
    }
  });

  await writeAutomationAudit(vm, meta.auditAction, meta.message, "SUCCESS", {
    previousState: vm.state,
    nextState: "DELETED"
  });
}

function getActionMeta(action: AutomatedVmAction, vmName: string): ActionMeta {
  switch (action) {
    case "AUTO_STOP":
      return {
        auditAction: "AUTO_STOP",
        message: `VM ${vmName} stopped by scheduler auto-stop policy`,
        schedulePatch: { autoStopAt: null }
      };
    case "EXPIRE_STOP":
      return {
        auditAction: "EXPIRE_STOP",
        message: `VM ${vmName} stopped by scheduler expiration policy`,
        schedulePatch: { expiresAt: null }
      };
    case "EXPIRE_DELETE":
      return {
        auditAction: "EXPIRE_DELETE",
        message: `VM ${vmName} deleted by scheduler expiration policy`,
        schedulePatch: { autoStopAt: null, expiresAt: null }
      };
    default:
      return {
        auditAction: "AUTO_STOP",
        message: `VM ${vmName} updated by scheduler`,
        schedulePatch: {}
      };
  }
}

async function writeAutomationAudit(
  vm: VmWithHost,
  action: AutomatedVmAction,
  message: string,
  result: AuditActionResult,
  metadata?: Prisma.InputJsonValue
): Promise<void> {
  const actionCode =
    action === "AUTO_STOP" ? "vm.auto_stop" : action === "EXPIRE_STOP" ? "vm.auto_expire_stop" : "vm.auto_expire_delete";

  await writeAuditLog({
    actorUserId: null,
    action: actionCode,
    resourceType: "VM",
    resourceId: vm.id,
    message,
    result,
    metadata
  });
}
