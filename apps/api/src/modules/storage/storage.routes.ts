import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { validateBody } from "../../common/validate.js";
import { prisma } from "../../lib/prisma.js";
import { createDiskVolumeSchema, createStoragePoolSchema } from "./storage.schemas.js";

export const storageRouter = Router();

storageRouter.use(requireAuth);

storageRouter.get(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (_req, res) => {
    const pools = await prisma.storagePool.findMany({
      include: {
        host: true,
        volumes: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(pools);
  })
);

storageRouter.post(
  "/pools",
  requireRole([RoleName.ADMINISTRADOR]),
  validateBody(createStoragePoolSchema),
  asyncHandler(async (req, res) => {
    const host = await prisma.hypervisorHost.findUnique({ where: { id: req.body.hostId } });
    if (!host) {
      throw new HttpError(400, "VALIDATION_ERROR", "Hypervisor host does not exist");
    }

    const pool = await prisma.storagePool.create({
      data: {
        name: req.body.name,
        type: req.body.type,
        capacityGb: req.body.capacityGb,
        hostId: req.body.hostId
      }
    });

    await writeAuditLog({
      req,
      action: "storage.pool.create",
      resourceType: "STORAGE_POOL",
      resourceId: pool.id,
      message: `Storage pool ${pool.name} created`
    });

    res.status(201).json(pool);
  })
);

storageRouter.post(
  "/volumes",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  validateBody(createDiskVolumeSchema),
  asyncHandler(async (req, res) => {
    const pool = await prisma.storagePool.findUnique({ where: { id: req.body.storagePoolId } });
    if (!pool) {
      throw new HttpError(400, "VALIDATION_ERROR", "Storage pool does not exist");
    }

    const volume = await prisma.diskVolume.create({
      data: {
        name: req.body.name,
        sizeGb: req.body.sizeGb,
        format: req.body.format,
        storagePoolId: req.body.storagePoolId,
        vmId: req.body.vmId,
        isBoot: req.body.isBoot ?? false
      }
    });

    await writeAuditLog({
      req,
      action: "storage.volume.create",
      resourceType: "DISK_VOLUME",
      resourceId: volume.id,
      message: `Volume ${volume.name} created`
    });

    res.status(201).json(volume);
  })
);

