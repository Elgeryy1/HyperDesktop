import { Prisma, RoleName, VmState } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody, validateQuery } from "../../common/validate.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { createTemplateFromVmSchema } from "../templates/templates.schemas.js";
import { getHypervisorProvider } from "./providers/factory.js";
import { ensureHostProviderMatches } from "./vm-actions.service.js";
import { runVmSchedulerTick } from "./vm-scheduler.js";
import {
  addVmDiskSchema,
  createVmSchema,
  extendVmScheduleSchema,
  listVmQuerySchema,
  runSchedulerNowSchema,
  updateVmHardwareSchema,
  updateVmScheduleSchema,
  updateVmSchema
} from "./vm.schemas.js";

const provider = getHypervisorProvider();

const ROLE_VM_QUOTAS: Record<RoleName, { maxVmCount: number; maxVcpuTotal: number; maxMemoryMbTotal: number } | null> = {
  [RoleName.ADMINISTRADOR]: null,
  [RoleName.PROFESOR]: {
    maxVmCount: 8,
    maxVcpuTotal: 12,
    maxMemoryMbTotal: 12288
  },
  [RoleName.ALUMNO]: {
    maxVmCount: 4,
    maxVcpuTotal: 6,
    maxMemoryMbTotal: 6144
  }
};

export const virtualMachinesRouter = Router();

virtualMachinesRouter.use(requireAuth);

virtualMachinesRouter.get(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  validateQuery(listVmQuerySchema),
  asyncHandler(async (req, res) => {
    const { state, search } = req.query as { state?: VmState; search?: string };
    const scopedUserId = req.user!.role === RoleName.ALUMNO ? req.user!.id : undefined;

    const vms = await prisma.virtualMachine.findMany({
      where: {
        ...(state ? { state } : {}),
        ...(scopedUserId ? { createdById: scopedUserId } : {}),
        ...(search
          ? {
              name: {
                contains: search,
                mode: "insensitive"
              }
            }
          : {}),
        deletedAt: null
      },
      include: {
        host: true,
        network: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const hydratedVms = await Promise.all(vms.map((vm) => hydrateVmRuntimeSnapshot(vm)));
    res.json(hydratedVms);
  })
);

virtualMachinesRouter.post(
  "/scheduler/run-now",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  validateBody(runSchedulerNowSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as { limit?: number };
    const result = await runVmSchedulerTick({ limit: payload.limit });

    await writeAuditLog({
      req,
      action: "vm.scheduler.run_now",
      resourceType: "VM_SCHEDULER",
      message: `Scheduler manual tick executed (${result.processed} processed)`
    });

    res.json(result);
  })
);

virtualMachinesRouter.get(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true,
        network: true,
        diskVolumes: {
          include: {
            storagePool: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);

    const hydratedVm = await hydrateVmRuntimeSnapshot(vm);
    res.json(hydratedVm);
  })
);

virtualMachinesRouter.post(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  validateBody(createVmSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as {
      name: string;
      vcpu?: number;
      memoryMb?: number;
      diskGb?: number;
      hostId: string;
      networkId?: string;
      isoId?: string;
      templateId?: string;
      osType?: string;
      autoStopAt?: Date | null;
      expiresAt?: Date | null;
      expirationAction?: "STOP" | "DELETE";
    };
    const role = req.user!.role;

    const template = payload.templateId
      ? await prisma.template.findUnique({
          where: { id: payload.templateId },
          include: {
            assignments: true,
            iso: {
              include: {
                storagePool: true
              }
            }
          }
        })
      : null;

    if (payload.templateId && !template) {
      throw new HttpError(400, "VALIDATION_ERROR", "Template does not exist");
    }
    if (role === RoleName.ALUMNO) {
      if (!template) {
        throw new HttpError(403, "FORBIDDEN", "ALUMNO users can only create VMs from assigned templates");
      }
      const isAssigned = template.assignments.some((assignment) => assignment.studentId === req.user!.id);
      if (!isAssigned) {
        throw new HttpError(403, "FORBIDDEN", "Template is not assigned to this ALUMNO user");
      }
    }
    const host = await prisma.hypervisorHost.findUnique({ where: { id: payload.hostId } });
    if (!host) {
      throw new HttpError(400, "VALIDATION_ERROR", "Hypervisor host does not exist");
    }
    if (env.HYPERVISOR_PROVIDER === "libvirt" && host.providerType !== "LIBVIRT") {
      throw new HttpError(400, "VALIDATION_ERROR", "Selected host is not a LIBVIRT host");
    }
    if (env.HYPERVISOR_PROVIDER === "mock" && host.providerType !== "MOCK") {
      throw new HttpError(400, "VALIDATION_ERROR", "Selected host is not a MOCK host");
    }

    const network = payload.networkId
      ? await prisma.network.findUnique({
          where: { id: payload.networkId }
        })
      : null;
    if (payload.networkId && !network) {
      throw new HttpError(400, "VALIDATION_ERROR", "Network does not exist");
    }
    if (network?.hostId && network.hostId !== host.id) {
      throw new HttpError(400, "VALIDATION_ERROR", "Network belongs to a different hypervisor host");
    }

    const resolvedVcpu =
      role === RoleName.ALUMNO ? template?.defaultVcpu : payload.vcpu ?? template?.defaultVcpu;
    const resolvedMemoryMb =
      role === RoleName.ALUMNO ? template?.defaultMemoryMb : payload.memoryMb ?? template?.defaultMemoryMb;
    const resolvedDiskGb =
      role === RoleName.ALUMNO ? template?.defaultDiskGb : payload.diskGb ?? template?.defaultDiskGb;
    const effectiveIsoId =
      role === RoleName.ALUMNO ? template?.isoId ?? undefined : payload.isoId ?? template?.isoId ?? undefined;

    if (resolvedVcpu === undefined || resolvedMemoryMb === undefined || resolvedDiskGb === undefined) {
      throw new HttpError(400, "VALIDATION_ERROR", "Unable to resolve VM resources (vcpu/memory/disk)");
    }

    await assertVmQuotaForUser({
      userId: req.user!.id,
      role,
      nextVcpu: resolvedVcpu,
      nextMemoryMb: resolvedMemoryMb
    });

    const iso = effectiveIsoId
      ? await prisma.isoImage.findUnique({
          where: { id: effectiveIsoId },
          include: {
            storagePool: true
          }
        })
      : null;
    if (effectiveIsoId && !iso) {
      throw new HttpError(400, "VALIDATION_ERROR", "ISO does not exist");
    }
    if (iso && iso.storagePool.hostId !== host.id) {
      throw new HttpError(400, "VALIDATION_ERROR", "ISO storage pool belongs to a different hypervisor host");
    }

    const hostDefaultStoragePool = await resolveDefaultStoragePoolForHost(host.id);
    const selectedStoragePool = iso?.storagePool ?? hostDefaultStoragePool;

    let createdInProvider: Awaited<ReturnType<typeof provider.createVm>>;
    try {
      createdInProvider = await provider.createVm(
        {
          name: payload.name,
          vcpu: resolvedVcpu,
          memoryMb: resolvedMemoryMb,
          diskGb: resolvedDiskGb,
          osType: payload.osType,
          isoPath: iso?.path,
          networkName: network?.name,
          storagePoolName: selectedStoragePool?.name ?? env.LIBVIRT_STORAGE_POOL
        },
        {
          hostName: host.name,
          connectionUri: host.connectionUri
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hypervisor provider error";
      throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
    }

    const vm = await prisma.virtualMachine.create({
      data: {
        name: payload.name,
        state: createdInProvider.state,
        externalId: createdInProvider.externalId,
        vcpu: resolvedVcpu,
        memoryMb: resolvedMemoryMb,
        diskGb: resolvedDiskGb,
        hostId: payload.hostId,
        networkId: payload.networkId,
        isoId: effectiveIsoId,
        templateId: payload.templateId,
        osType: payload.osType,
        autoStopAt: payload.autoStopAt,
        expiresAt: payload.expiresAt,
        expirationAction: payload.expirationAction,
        createdById: req.user!.id
      },
      include: { host: true, network: true }
    });

    if (selectedStoragePool) {
      const primaryVolumeName = `${createdInProvider.externalId ?? vm.name}.qcow2`;
      await prisma.diskVolume.create({
        data: {
          name: primaryVolumeName,
          externalId: primaryVolumeName,
          sizeGb: resolvedDiskGb,
          format: "qcow2",
          storagePoolId: selectedStoragePool.id,
          vmId: vm.id,
          isBoot: true
        }
      });
    }

    await writeAuditLog({
      req,
      action: "vm.create",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} created`
    });

    res.status(201).json(vm);
  })
);

virtualMachinesRouter.patch(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  validateBody(updateVmSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const payload = req.body as { osType?: string; networkId?: string | null };
    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true
      }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);

    let targetNetworkName: string | null | undefined;
    if (payload.networkId !== undefined && payload.networkId !== null) {
      const network = await prisma.network.findUnique({
        where: { id: payload.networkId }
      });
      if (!network) {
        throw new HttpError(400, "VALIDATION_ERROR", "Network does not exist");
      }
      if (network.hostId && network.hostId !== vm.hostId) {
        throw new HttpError(400, "VALIDATION_ERROR", "Network belongs to a different hypervisor host");
      }
      targetNetworkName = network.name;
    } else if (payload.networkId === null) {
      targetNetworkName = null;
    }

    const updateData: { osType?: string; networkId?: string | null } = {};
    if (payload.osType !== undefined) {
      updateData.osType = payload.osType;
    }
    if (payload.networkId !== undefined) {
      updateData.networkId = payload.networkId;
    }

    const networkChanged = payload.networkId !== undefined && payload.networkId !== vm.networkId;
    let providerVm:
      | {
          state: VmState;
          ipAddress?: string;
        }
      | undefined;

    if (networkChanged && vm.externalId && provider.updateVmNetwork) {
      ensureHostProviderMatches(vm.host.providerType);
      try {
        const updatedByProvider = await provider.updateVmNetwork(vm.externalId, targetNetworkName ?? null, {
          hostName: vm.host.name,
          connectionUri: vm.host.connectionUri
        });
        providerVm = {
          state: updatedByProvider.state as VmState,
          ipAddress: updatedByProvider.ipAddress
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Hypervisor provider error";
        throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
      }
    }

    const updatedVm = await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        ...updateData,
        state: providerVm?.state ?? undefined,
        ipAddress: providerVm ? (providerVm.state === "RUNNING" ? providerVm.ipAddress ?? vm.ipAddress : null) : undefined
      }
    });

    await writeAuditLog({
      req,
      action: "vm.update",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} updated`
    });

    res.json(updatedVm);
  })
);

virtualMachinesRouter.patch(
  "/:id/hardware",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  validateBody(updateVmHardwareSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const payload = req.body as { vcpu?: number; memoryMb?: number; diskGb?: number };

    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true,
        diskVolumes: true
      }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);
    if (!vm.externalId) {
      throw new HttpError(409, "CONFLICT", "VM has no external provider ID");
    }
    ensureHostProviderMatches(vm.host.providerType);

    if (payload.diskGb !== undefined && payload.diskGb < vm.diskGb) {
      throw new HttpError(400, "VALIDATION_ERROR", "Disk shrink is not supported. Increase disk size only.");
    }

    const hardwareUpdate = {
      vcpu: payload.vcpu !== undefined && payload.vcpu !== vm.vcpu ? payload.vcpu : undefined,
      memoryMb: payload.memoryMb !== undefined && payload.memoryMb !== vm.memoryMb ? payload.memoryMb : undefined,
      diskGb: payload.diskGb !== undefined && payload.diskGb !== vm.diskGb ? payload.diskGb : undefined
    };
    const hasHardwareChanges = Object.values(hardwareUpdate).some((value) => value !== undefined);

    if (hasHardwareChanges && req.user!.id === vm.createdById) {
      await assertVmQuotaForUser({
        userId: req.user!.id,
        role: req.user!.role,
        nextVcpu: hardwareUpdate.vcpu ?? vm.vcpu,
        nextMemoryMb: hardwareUpdate.memoryMb ?? vm.memoryMb,
        existingVmId: vm.id
      });
    }

    let providerVm:
      | {
          state: VmState;
          ipAddress?: string;
        }
      | undefined;

    if (hasHardwareChanges && provider.updateVmResources) {
      try {
        const updatedByProvider = await provider.updateVmResources(
          vm.externalId,
          {
            vcpu: hardwareUpdate.vcpu,
            memoryMb: hardwareUpdate.memoryMb,
            diskGb: hardwareUpdate.diskGb
          },
          {
            hostName: vm.host.name,
            connectionUri: vm.host.connectionUri
          }
        );
        providerVm = {
          state: updatedByProvider.state as VmState,
          ipAddress: updatedByProvider.ipAddress
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Hypervisor provider error";
        throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
      }
    }

    const updatedVm = await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        vcpu: hardwareUpdate.vcpu,
        memoryMb: hardwareUpdate.memoryMb,
        diskGb: hardwareUpdate.diskGb,
        state: providerVm?.state ?? undefined,
        ipAddress: providerVm ? (providerVm.state === "RUNNING" ? providerVm.ipAddress ?? vm.ipAddress : null) : undefined
      }
    });

    if (hardwareUpdate.diskGb !== undefined) {
      const bootVolume = vm.diskVolumes.find((volume) => volume.isBoot) ?? vm.diskVolumes[0];
      if (bootVolume) {
        await prisma.diskVolume.update({
          where: { id: bootVolume.id },
          data: {
            sizeGb: hardwareUpdate.diskGb
          }
        });
      } else {
        const storagePool = await resolveDefaultStoragePoolForHost(vm.hostId);
        if (storagePool) {
          const bootVolumeName = `${vm.externalId}.qcow2`;
          await prisma.diskVolume.create({
            data: {
              name: bootVolumeName,
              externalId: bootVolumeName,
              sizeGb: hardwareUpdate.diskGb,
              format: "qcow2",
              storagePoolId: storagePool.id,
              vmId: vm.id,
              isBoot: true
            }
          });
        }
      }
    }

    await writeAuditLog({
      req,
      action: "vm.hardware.update",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} hardware updated`
    });

    res.json(updatedVm);
  })
);

virtualMachinesRouter.post(
  "/:id/disks",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  validateBody(addVmDiskSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const payload = req.body as { sizeGb: number; storagePoolId?: string; format?: "qcow2" | "raw"; name?: string };

    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true
      }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);
    if (!vm.externalId) {
      throw new HttpError(409, "CONFLICT", "VM has no external provider ID");
    }
    ensureHostProviderMatches(vm.host.providerType);
    if (!provider.attachDisk) {
      throw new HttpError(501, "NOT_IMPLEMENTED", "Current hypervisor provider does not support disk attachment");
    }

    const storagePool = payload.storagePoolId
      ? await prisma.storagePool.findUnique({
          where: { id: payload.storagePoolId }
        })
      : await resolveDefaultStoragePoolForHost(vm.hostId);

    if (!storagePool) {
      throw new HttpError(400, "VALIDATION_ERROR", "Storage pool not found");
    }
    if (storagePool.hostId !== vm.hostId) {
      throw new HttpError(400, "VALIDATION_ERROR", "Storage pool belongs to a different hypervisor host");
    }

    let attached;
    try {
      attached = await provider.attachDisk(
        vm.externalId,
        {
          sizeGb: payload.sizeGb,
          format: payload.format,
          volumeName: payload.name,
          storagePoolName: storagePool.name
        },
        {
          hostName: vm.host.name,
          connectionUri: vm.host.connectionUri
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hypervisor provider error";
      throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
    }

    const diskVolume = await prisma.diskVolume.create({
      data: {
        name: attached.volumeName,
        externalId: attached.volumeName,
        sizeGb: attached.sizeGb,
        format: attached.format,
        storagePoolId: storagePool.id,
        vmId: vm.id,
        isBoot: false
      },
      include: {
        storagePool: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    await writeAuditLog({
      req,
      action: "vm.disk.attach",
      resourceType: "VM",
      resourceId: vm.id,
      message: `Extra disk ${diskVolume.name} (${diskVolume.sizeGb}GB) attached to VM ${vm.name}`
    });

    res.status(201).json(diskVolume);
  })
);

virtualMachinesRouter.patch(
  "/:id/schedule",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  validateBody(updateVmScheduleSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const payload = req.body as {
      autoStopAt?: Date | null;
      expiresAt?: Date | null;
      expirationAction?: "STOP" | "DELETE";
    };

    const vm = await prisma.virtualMachine.findUnique({
      where: { id }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);

    const mergedAutoStopAt = payload.autoStopAt !== undefined ? payload.autoStopAt : vm.autoStopAt;
    const mergedExpiresAt = payload.expiresAt !== undefined ? payload.expiresAt : vm.expiresAt;
    assertScheduleWindow(mergedAutoStopAt, mergedExpiresAt);

    const updatedVm = await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        autoStopAt: payload.autoStopAt !== undefined ? payload.autoStopAt : undefined,
        expiresAt: payload.expiresAt !== undefined ? payload.expiresAt : undefined,
        expirationAction: payload.expirationAction ?? undefined
      }
    });

    await writeAuditLog({
      req,
      action: "vm.schedule.update",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} scheduling policy updated`
    });

    res.json(updatedVm);
  })
);

virtualMachinesRouter.post(
  "/:id/schedule/extend",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  validateBody(extendVmScheduleSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const payload = req.body as { minutes: number; target: "autoStopAt" | "expiresAt" };

    const vm = await prisma.virtualMachine.findUnique({
      where: { id }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);

    const now = Date.now();
    const currentTarget = payload.target === "autoStopAt" ? vm.autoStopAt : vm.expiresAt;
    const baseMs = currentTarget && currentTarget.getTime() > now ? currentTarget.getTime() : now;
    const nextValue = new Date(baseMs + payload.minutes * 60_000);

    const nextAutoStopAt = payload.target === "autoStopAt" ? nextValue : vm.autoStopAt;
    const nextExpiresAt = payload.target === "expiresAt" ? nextValue : vm.expiresAt;
    assertScheduleWindow(nextAutoStopAt, nextExpiresAt);

    const scheduleExtensionData = payload.target === "autoStopAt" ? { autoStopAt: nextValue } : { expiresAt: nextValue };
    const updatedVm = await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: scheduleExtensionData
    });

    await writeAuditLog({
      req,
      action: "vm.schedule.extend",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} ${payload.target} extended by ${payload.minutes} minutes`
    });

    res.json(updatedVm);
  })
);

virtualMachinesRouter.post(
  "/:id/actions/start",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true
      }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);
    if (!vm.externalId) {
      throw new HttpError(409, "CONFLICT", "VM has no external provider ID");
    }
    ensureHostProviderMatches(vm.host.providerType);

    let providerVm: Awaited<ReturnType<typeof provider.startVm>>;
    try {
      providerVm = await provider.startVm(vm.externalId, {
        hostName: vm.host.name,
        connectionUri: vm.host.connectionUri
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hypervisor provider error";
      throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
    }
    const updatedVm = await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        state: providerVm.state,
        ipAddress: providerVm.ipAddress
      }
    });

    await writeAuditLog({
      req,
      action: "vm.start",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} started`
    });

    res.json(updatedVm);
  })
);

virtualMachinesRouter.post(
  "/:id/actions/stop",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true
      }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);
    if (!vm.externalId) {
      throw new HttpError(409, "CONFLICT", "VM has no external provider ID");
    }
    ensureHostProviderMatches(vm.host.providerType);

    let providerVm: Awaited<ReturnType<typeof provider.stopVm>>;
    try {
      providerVm = await provider.stopVm(vm.externalId, {
        hostName: vm.host.name,
        connectionUri: vm.host.connectionUri
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hypervisor provider error";
      throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
    }
    const updatedVm = await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        state: providerVm.state
      }
    });

    await writeAuditLog({
      req,
      action: "vm.stop",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} stopped`
    });

    res.json(updatedVm);
  })
);

virtualMachinesRouter.post(
  "/:id/actions/force-stop",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true
      }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);
    if (!vm.externalId) {
      throw new HttpError(409, "CONFLICT", "VM has no external provider ID");
    }
    ensureHostProviderMatches(vm.host.providerType);
    if (!provider.forceStopVm) {
      throw new HttpError(501, "NOT_IMPLEMENTED", "Current hypervisor provider does not support force stop");
    }

    let providerVm;
    try {
      providerVm = await provider.forceStopVm(vm.externalId, {
        hostName: vm.host.name,
        connectionUri: vm.host.connectionUri
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hypervisor provider error";
      throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
    }

    const updatedVm = await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        state: providerVm.state,
        ipAddress: null
      }
    });

    await writeAuditLog({
      req,
      action: "vm.force_stop",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} force-stopped`
    });

    res.json(updatedVm);
  })
);

virtualMachinesRouter.post(
  "/:id/actions/reboot",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true
      }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);
    if (!vm.externalId) {
      throw new HttpError(409, "CONFLICT", "VM has no external provider ID");
    }
    ensureHostProviderMatches(vm.host.providerType);

    let providerVm: Awaited<ReturnType<typeof provider.rebootVm>>;
    try {
      providerVm = await provider.rebootVm(vm.externalId, {
        hostName: vm.host.name,
        connectionUri: vm.host.connectionUri
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hypervisor provider error";
      throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
    }
    const updatedVm = await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        state: providerVm.state
      }
    });

    await writeAuditLog({
      req,
      action: "vm.reboot",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} rebooted`
    });

    res.json(updatedVm);
  })
);

virtualMachinesRouter.post(
  "/:id/actions/create-template",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  validateBody(createTemplateFromVmSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const payload = req.body as { name: string; version?: string };

    const vm = await prisma.virtualMachine.findUnique({
      where: { id }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    if (req.user!.role === RoleName.PROFESOR && vm.createdById !== req.user!.id) {
      throw new HttpError(403, "FORBIDDEN", "You can only create templates from your own VMs");
    }

    const templateVersion = payload.version?.trim() || `snapshot-${new Date().toISOString().slice(0, 10)}`;

    try {
      const template = await prisma.template.create({
        data: {
          name: payload.name.trim(),
          version: templateVersion,
          sourceType: "VM",
          sourceVmId: vm.id,
          createdById: req.user!.id,
          isoId: vm.isoId ?? undefined,
          defaultVcpu: vm.vcpu,
          defaultMemoryMb: vm.memoryMb,
          defaultDiskGb: vm.diskGb
        }
      });

      await writeAuditLog({
        req,
        action: "template.create_from_vm",
        resourceType: "TEMPLATE",
        resourceId: template.id,
        message: `Template ${template.name}:${template.version} created from VM ${vm.name}`
      });

      res.status(201).json(template);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "CONFLICT", "Template name/version already exists");
      }
      throw error;
    }
  })
);

virtualMachinesRouter.delete(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: {
        host: true
      }
    });
    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }
    assertVmAccessByRole(vm, req.user!);

    if (vm.externalId) {
      ensureHostProviderMatches(vm.host.providerType);
      try {
        await provider.deleteVm(vm.externalId, {
          hostName: vm.host.name,
          connectionUri: vm.host.connectionUri
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Hypervisor provider error";
        throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
      }
    }

    await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        state: "DELETED",
        deletedAt: new Date(),
        autoStopAt: null,
        expiresAt: null
      }
    });

    await writeAuditLog({
      req,
      action: "vm.delete",
      resourceType: "VM",
      resourceId: vm.id,
      message: `VM ${vm.name} deleted`
    });

    res.status(204).send();
  })
);

type AuthenticatedUser = {
  id: string;
  role: RoleName;
};

function assertVmAccessByRole(vm: { createdById: string }, user: AuthenticatedUser): void {
  if (user.role === RoleName.ALUMNO && vm.createdById !== user.id) {
    throw new HttpError(403, "FORBIDDEN", "ALUMNO users can only access their own virtual machines");
  }
}

async function assertVmQuotaForUser(input: {
  userId: string;
  role: RoleName;
  nextVcpu: number;
  nextMemoryMb: number;
  existingVmId?: string;
}): Promise<void> {
  const quota = ROLE_VM_QUOTAS[input.role];
  if (!quota) {
    return;
  }

  const usage = await prisma.virtualMachine.aggregate({
    where: {
      createdById: input.userId,
      deletedAt: null,
      ...(input.existingVmId ? { id: { not: input.existingVmId } } : {})
    },
    _count: {
      _all: true
    },
    _sum: {
      vcpu: true,
      memoryMb: true
    }
  });

  const vmCountWithCandidate = (usage._count._all ?? 0) + 1;
  const vcpuWithCandidate = (usage._sum.vcpu ?? 0) + input.nextVcpu;
  const memoryWithCandidate = (usage._sum.memoryMb ?? 0) + input.nextMemoryMb;

  if (vmCountWithCandidate > quota.maxVmCount) {
    throw new HttpError(
      400,
      "QUOTA_EXCEEDED",
      `VM quota exceeded for role ${input.role}: max ${quota.maxVmCount} VMs`
    );
  }
  if (vcpuWithCandidate > quota.maxVcpuTotal) {
    throw new HttpError(
      400,
      "QUOTA_EXCEEDED",
      `CPU quota exceeded for role ${input.role}: max ${quota.maxVcpuTotal} total vCPU`
    );
  }
  if (memoryWithCandidate > quota.maxMemoryMbTotal) {
    throw new HttpError(
      400,
      "QUOTA_EXCEEDED",
      `Memory quota exceeded for role ${input.role}: max ${quota.maxMemoryMbTotal} MB`
    );
  }
}

async function resolveDefaultStoragePoolForHost(hostId: string): Promise<{ id: string; name: string; hostId: string } | null> {
  const preferredPool = await prisma.storagePool.findFirst({
    where: {
      hostId,
      name: env.LIBVIRT_STORAGE_POOL
    },
    select: {
      id: true,
      name: true,
      hostId: true
    }
  });

  if (preferredPool) {
    return preferredPool;
  }

  return prisma.storagePool.findFirst({
    where: { hostId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      hostId: true
    }
  });
}

function assertScheduleWindow(autoStopAt: Date | null | undefined, expiresAt: Date | null | undefined): void {
  if (autoStopAt && expiresAt && expiresAt.getTime() < autoStopAt.getTime()) {
    throw new HttpError(400, "VALIDATION_ERROR", "expiresAt must be greater than or equal to autoStopAt");
  }
}

type VmRuntimeSnapshot = {
  id: string;
  state: VmState;
  ipAddress: string | null;
  externalId: string | null;
  host: {
    name: string;
    connectionUri: string;
    providerType: "MOCK" | "LIBVIRT";
  };
};

async function hydrateVmRuntimeSnapshot<T extends VmRuntimeSnapshot>(vm: T): Promise<T> {
  if (!provider.getVmRuntime || !vm.externalId) {
    return vm;
  }

  if (env.HYPERVISOR_PROVIDER === "libvirt" && vm.host.providerType !== "LIBVIRT") {
    return vm;
  }
  if (env.HYPERVISOR_PROVIDER === "mock" && vm.host.providerType !== "MOCK") {
    return vm;
  }

  try {
    const runtime = await provider.getVmRuntime(vm.externalId, {
      hostName: vm.host.name,
      connectionUri: vm.host.connectionUri
    });
    if (!runtime) {
      return vm;
    }

    const nextState = runtime.state as VmState;
    const nextIpAddress = nextState === "RUNNING" ? runtime.ipAddress ?? vm.ipAddress : null;

    if (nextState === vm.state && nextIpAddress === vm.ipAddress) {
      return vm;
    }

    await prisma.virtualMachine.update({
      where: { id: vm.id },
      data: {
        state: nextState,
        ipAddress: nextIpAddress
      }
    });

    return {
      ...vm,
      state: nextState,
      ipAddress: nextIpAddress
    };
  } catch {
    return vm;
  }
}
