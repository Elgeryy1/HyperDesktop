import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody } from "../../common/validate.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { runCommand } from "../virtual-machines/providers/command-executor.js";
import { discoverLibvirtHost } from "./libvirt-discovery.js";
import { createHypervisorSchema, updateHypervisorSchema } from "./hypervisors.schemas.js";

export const hypervisorsRouter = Router();

hypervisorsRouter.use(requireAuth);

hypervisorsRouter.get(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (_req, res) => {
    const hosts = await prisma.hypervisorHost.findMany({
      include: {
        _count: {
          select: {
            virtualMachines: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(hosts);
  })
);

hypervisorsRouter.post(
  "/",
  requireRole([RoleName.ADMINISTRADOR]),
  validateBody(createHypervisorSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.hypervisorHost.findUnique({
      where: { name: req.body.name }
    });
    if (existing) {
      throw new HttpError(409, "CONFLICT", "Hypervisor name already exists");
    }

    const connectionUri =
      req.body.connectionUri?.trim() || (req.body.providerType === "MOCK" ? "mock://local" : env.LIBVIRT_DEFAULT_URI);

    const effectiveConnectionUri =
      req.body.providerType === "LIBVIRT" ? resolveLibvirtConnectionUri(connectionUri) : connectionUri;

    const host = await prisma.hypervisorHost.create({
      data: {
        ...req.body,
        connectionUri: effectiveConnectionUri
      }
    });

    await writeAuditLog({
      req,
      action: "hypervisor.create",
      resourceType: "HYPERVISOR",
      resourceId: host.id,
      message: `Hypervisor ${host.name} registered`
    });

    res.status(201).json(host);
  })
);

hypervisorsRouter.get(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const host = await prisma.hypervisorHost.findUnique({
      where: { id },
      include: {
        virtualMachines: true,
        storagePools: true
      }
    });
    if (!host) {
      throw new HttpError(404, "NOT_FOUND", "Hypervisor not found");
    }
    res.json(host);
  })
);

hypervisorsRouter.patch(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR]),
  validateBody(updateHypervisorSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const host = await prisma.hypervisorHost.findUnique({
      where: { id }
    });
    if (!host) {
      throw new HttpError(404, "NOT_FOUND", "Hypervisor not found");
    }

    const updated = await prisma.hypervisorHost.update({
      where: { id },
      data: req.body
    });

    await writeAuditLog({
      req,
      action: "hypervisor.update",
      resourceType: "HYPERVISOR",
      resourceId: updated.id,
      message: `Hypervisor ${updated.name} updated`
    });

    res.json(updated);
  })
);

hypervisorsRouter.post(
  "/:id/actions/probe",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const host = await prisma.hypervisorHost.findUnique({
      where: { id }
    });
    if (!host) {
      throw new HttpError(404, "NOT_FOUND", "Hypervisor not found");
    }

    if (host.providerType === "MOCK") {
      const updated = await prisma.hypervisorHost.update({
        where: { id: host.id },
        data: {
          status: "ONLINE",
          lastHeartbeatAt: new Date()
        }
      });
      await writeAuditLog({
        req,
        action: "hypervisor.probe",
        resourceType: "HYPERVISOR",
        resourceId: host.id,
        message: `Hypervisor ${host.name} probe successful (MOCK)`
      });
      res.json({
        ok: true,
        message: "Mock hypervisor is always reachable in development mode.",
        host: updated
      });
      return;
    }

    try {
      const probeConnectionUri = resolveLibvirtConnectionUri(host.connectionUri);
      await runCommand("virsh", ["-c", probeConnectionUri, "list", "--all"], { timeoutMs: env.LIBVIRT_COMMAND_TIMEOUT_MS });
      const discovery = await discoverLibvirtHost(probeConnectionUri);

      const updated = await prisma.$transaction(async (tx) => {
        const hostUpdate = await tx.hypervisorHost.update({
          where: { id: host.id },
          data: {
            connectionUri: probeConnectionUri,
            status: "ONLINE",
            lastHeartbeatAt: new Date(),
            cpuCoresTotal: discovery.cpuCoresTotal,
            memoryMbTotal: discovery.memoryMbTotal,
            storageGbTotal: discovery.storageGbTotal
          }
        });

        for (const pool of discovery.storagePools) {
          await tx.storagePool.upsert({
            where: {
              hostId_name: {
                hostId: host.id,
                name: pool.name
              }
            },
            update: {
              type: pool.type,
              status: pool.status,
              capacityGb: pool.capacityGb,
              usedGb: pool.usedGb
            },
            create: {
              name: pool.name,
              type: pool.type,
              status: pool.status,
              capacityGb: pool.capacityGb,
              usedGb: pool.usedGb,
              hostId: host.id
            }
          });
        }

        if (discovery.storagePools.length > 0) {
          await tx.storagePool.updateMany({
            where: {
              hostId: host.id,
              name: {
                notIn: discovery.storagePools.map((pool) => pool.name)
              }
            },
            data: {
              status: "OFFLINE"
            }
          });
        }

        for (const network of discovery.networks) {
          await tx.network.upsert({
            where: {
              name_hostId: {
                name: network.name,
                hostId: host.id
              }
            },
            update: {
              type: network.type,
              cidr: network.cidr,
              gatewayIp: network.gatewayIp,
              vlanId: network.vlanId
            },
            create: {
              name: network.name,
              type: network.type,
              cidr: network.cidr,
              gatewayIp: network.gatewayIp,
              vlanId: network.vlanId,
              hostId: host.id
            }
          });
        }

        if (discovery.networks.length > 0) {
          await tx.network.deleteMany({
            where: {
              hostId: host.id,
              name: {
                notIn: discovery.networks.map((network) => network.name)
              },
              virtualMachines: {
                none: {}
              }
            }
          });
        }

        return hostUpdate;
      });

      await writeAuditLog({
        req,
        action: "hypervisor.probe",
        resourceType: "HYPERVISOR",
        resourceId: host.id,
        message: `Hypervisor ${host.name} probe successful`
      });

      res.json({
        ok: true,
        message: `Connected to libvirt successfully. Synced ${discovery.storagePools.length} storage pools and ${discovery.networks.length} networks.`,
        host: updated,
        synced: {
          storagePools: discovery.storagePools.length,
          networks: discovery.networks.length
        }
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown libvirt connection error";
      const updated = await prisma.hypervisorHost.update({
        where: { id: host.id },
        data: {
          status: "OFFLINE"
        }
      });

      await writeAuditLog({
        req,
        action: "hypervisor.probe",
        resourceType: "HYPERVISOR",
        resourceId: host.id,
        message: `Hypervisor ${host.name} probe failed`,
        result: "FAILED",
        metadata: {
          error: details
        }
      });

      res.json({
        ok: false,
        message: details,
        host: updated
      });
    }
  })
);

function resolveLibvirtConnectionUri(connectionUri: string): string {
  const value = connectionUri.trim();
  if (!value) {
    return env.LIBVIRT_DEFAULT_URI;
  }

  const isLocalSocketUri = value === "qemu:///system" || value === "qemu:///session";
  if (!isLocalSocketUri) {
    return value;
  }

  const fallback = env.LIBVIRT_DEFAULT_URI.trim();
  if (!fallback) {
    return value;
  }

  // If API runs in Docker, local socket URIs may be unreachable.
  // Reuse configured default URI (typically qemu+ssh://user@host.docker.internal/system).
  return fallback;
}

hypervisorsRouter.delete(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const host = await prisma.hypervisorHost.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            virtualMachines: true
          }
        }
      }
    });
    if (!host) {
      throw new HttpError(404, "NOT_FOUND", "Hypervisor not found");
    }
    if (host._count.virtualMachines > 0) {
      throw new HttpError(409, "CONFLICT", "Cannot delete host with linked VMs");
    }

    await prisma.hypervisorHost.delete({
      where: { id }
    });

    await writeAuditLog({
      req,
      action: "hypervisor.delete",
      resourceType: "HYPERVISOR",
      resourceId: host.id,
      message: `Hypervisor ${host.name} removed`
    });

    res.status(204).send();
  })
);
