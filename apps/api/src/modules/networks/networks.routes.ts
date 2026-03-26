import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody } from "../../common/validate.js";
import { prisma } from "../../lib/prisma.js";
import { createNetworkSchema, updateNetworkSchema } from "./networks.schemas.js";

export const networksRouter = Router();

networksRouter.use(requireAuth);

networksRouter.get(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (_req, res) => {
    const networks = await prisma.network.findMany({
      include: {
        host: true,
        virtualMachines: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(networks);
  })
);

networksRouter.post(
  "/",
  requireRole([RoleName.ADMINISTRADOR]),
  validateBody(createNetworkSchema),
  asyncHandler(async (req, res) => {
    if (req.body.hostId) {
      const host = await prisma.hypervisorHost.findUnique({ where: { id: req.body.hostId } });
      if (!host) {
        throw new HttpError(400, "VALIDATION_ERROR", "Hypervisor host does not exist");
      }
    }

    const existingCount = await prisma.network.count({
      where: {
        type: req.body.type,
        ...(req.body.hostId ? { hostId: req.body.hostId } : {})
      }
    });

    const autoConfig = buildAutomaticNetworkConfig(req.body.type, existingCount, req.body.vlanId);

    const network = await prisma.network.create({
      data: {
        name: req.body.name,
        type: req.body.type,
        cidr: req.body.cidr ?? autoConfig.cidr,
        gatewayIp: req.body.gatewayIp ?? autoConfig.gatewayIp ?? null,
        vlanId: req.body.type === "VLAN" ? req.body.vlanId ?? autoConfig.vlanId ?? null : null,
        hostId: req.body.hostId ?? null
      }
    });

    await writeAuditLog({
      req,
      action: "network.create",
      resourceType: "NETWORK",
      resourceId: network.id,
      message: `Network ${network.name} created`
    });

    res.status(201).json(network);
  })
);

function buildAutomaticNetworkConfig(
  type: "BRIDGE" | "NAT" | "VLAN" | "INTERNAL",
  existingCount: number,
  providedVlanId?: number
): { cidr: string; gatewayIp?: string; vlanId?: number } {
  const segment = (existingCount % 200) + 20;

  if (type === "NAT") {
    return {
      cidr: `10.60.${segment}.0/24`,
      gatewayIp: `10.60.${segment}.1`
    };
  }

  if (type === "INTERNAL") {
    return {
      cidr: `10.70.${segment}.0/24`,
      gatewayIp: `10.70.${segment}.1`
    };
  }

  if (type === "BRIDGE") {
    return {
      cidr: `192.168.${segment}.0/24`,
      gatewayIp: `192.168.${segment}.1`
    };
  }

  const vlanId = providedVlanId ?? 100 + existingCount;
  const secondOctet = (vlanId % 200) + 20;

  return {
    vlanId,
    cidr: `10.${secondOctet}.0.0/24`,
    gatewayIp: `10.${secondOctet}.0.1`
  };
}

networksRouter.patch(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR]),
  validateBody(updateNetworkSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const network = await prisma.network.findUnique({ where: { id } });
    if (!network) {
      throw new HttpError(404, "NOT_FOUND", "Network not found");
    }

    const updated = await prisma.network.update({
      where: { id },
      data: req.body
    });

    await writeAuditLog({
      req,
      action: "network.update",
      resourceType: "NETWORK",
      resourceId: updated.id,
      message: `Network ${updated.name} updated`
    });

    res.json(updated);
  })
);
