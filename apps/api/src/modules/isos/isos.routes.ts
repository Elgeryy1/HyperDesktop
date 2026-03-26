import { Prisma, RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody } from "../../common/validate.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { hashFileSha256, isoUploadMiddleware, removeUploadedFile } from "./iso-upload.js";
import { createIsoSchema, uploadIsoMetadataSchema } from "./isos.schemas.js";

export const isosRouter = Router();

isosRouter.use(requireAuth);

isosRouter.get(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (_req, res) => {
    const isos = await prisma.isoImage.findMany({
      include: {
        storagePool: true,
        uploadedBy: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(isos.map(serializeIso));
  })
);

isosRouter.post(
  "/upload",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      isoUploadMiddleware(req, res, (error: unknown) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const uploadedFile = req.file;
    if (!uploadedFile) {
      throw new HttpError(400, "VALIDATION_ERROR", "ISO file is required (field: iso)");
    }

    if (!uploadedFile.originalname.toLowerCase().endsWith(".iso")) {
      await removeUploadedFile(uploadedFile.path);
      throw new HttpError(400, "VALIDATION_ERROR", "Only .iso files are accepted");
    }

    const parsed = uploadIsoMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      await removeUploadedFile(uploadedFile.path);
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid upload metadata", parsed.error.flatten());
    }

    let storagePoolId = parsed.data.storagePoolId;
    if (!storagePoolId) {
      const defaultPool = await resolveDefaultStoragePoolForCurrentProvider();
      if (!defaultPool) {
        await removeUploadedFile(uploadedFile.path);
        throw new HttpError(400, "VALIDATION_ERROR", "No storage pool available. Create one first.");
      }
      storagePoolId = defaultPool.id;
    }

    const storagePool = await prisma.storagePool.findUnique({
      where: { id: storagePoolId },
      include: {
        host: true
      }
    });
    if (!storagePool) {
      await removeUploadedFile(uploadedFile.path);
      throw new HttpError(400, "VALIDATION_ERROR", "Storage pool does not exist");
    }
    ensureStoragePoolMatchesProvider(storagePool.host.providerType);

    const checksumSha256 = await hashFileSha256(uploadedFile.path);
    const inferredName = uploadedFile.originalname.replace(/\.iso$/i, "");

    try {
      const iso = await prisma.isoImage.create({
        data: {
          name: parsed.data.name ?? inferredName,
          version: parsed.data.version,
          osFamily: parsed.data.osFamily,
          checksumSha256,
          sizeBytes: BigInt(uploadedFile.size),
          storagePoolId,
          path: uploadedFile.path,
          uploadedById: req.user!.id
        }
      });

      await writeAuditLog({
        req,
        action: "iso.upload",
        resourceType: "ISO",
        resourceId: iso.id,
        message: `ISO ${iso.name} uploaded from local PC`
      });

      res.status(201).json(serializeIso(iso));
    } catch (error) {
      await removeUploadedFile(uploadedFile.path);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "CONFLICT", "An ISO with the same checksum already exists");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new HttpError(401, "UNAUTHORIZED", "Invalid user session. Please login again.");
      }
      throw error;
    }
  })
);

isosRouter.post(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  validateBody(createIsoSchema),
  asyncHandler(async (req, res) => {
    const pool = await prisma.storagePool.findUnique({
      where: { id: req.body.storagePoolId },
      include: {
        host: true
      }
    });
    if (!pool) {
      throw new HttpError(400, "VALIDATION_ERROR", "Storage pool does not exist");
    }
    ensureStoragePoolMatchesProvider(pool.host.providerType);

    const iso = await prisma.isoImage.create({
      data: {
        name: req.body.name,
        version: req.body.version,
        osFamily: req.body.osFamily,
        checksumSha256: req.body.checksumSha256,
        sizeBytes: req.body.sizeBytes,
        storagePoolId: req.body.storagePoolId,
        path: req.body.path,
        uploadedById: req.user!.id
      }
    });

    await writeAuditLog({
      req,
      action: "iso.create",
      resourceType: "ISO",
      resourceId: iso.id,
      message: `ISO ${iso.name} registered`
    });

    res.status(201).json(serializeIso(iso));
  })
);

isosRouter.delete(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const iso = await prisma.isoImage.findUnique({ where: { id } });
    if (!iso) {
      throw new HttpError(404, "NOT_FOUND", "ISO not found");
    }

    await prisma.isoImage.delete({ where: { id } });
    await writeAuditLog({
      req,
      action: "iso.delete",
      resourceType: "ISO",
      resourceId: id,
      message: `ISO ${iso.name} deleted`
    });

    res.status(204).send();
  })
);

function serializeIso(iso: {
  sizeBytes: bigint;
  [key: string]: unknown;
}) {
  return {
    ...iso,
    sizeBytes: iso.sizeBytes.toString()
  };
}

async function resolveDefaultStoragePoolForCurrentProvider(): Promise<{ id: string } | null> {
  if (env.HYPERVISOR_PROVIDER === "libvirt") {
    const preferredLibvirtPool = await prisma.storagePool.findFirst({
      where: {
        name: env.LIBVIRT_STORAGE_POOL,
        host: {
          providerType: "LIBVIRT"
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        id: true
      }
    });

    if (preferredLibvirtPool) {
      return preferredLibvirtPool;
    }

    const fallbackLibvirtPool = await prisma.storagePool.findFirst({
      where: {
        host: {
          providerType: "LIBVIRT"
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        id: true
      }
    });

    if (fallbackLibvirtPool) {
      return fallbackLibvirtPool;
    }
  }

  const preferredMockPool = await prisma.storagePool.findFirst({
    where: {
      host: {
        providerType: "MOCK"
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });

  if (preferredMockPool) {
    return preferredMockPool;
  }

  return prisma.storagePool.findFirst({
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });
}

function ensureStoragePoolMatchesProvider(providerType: "MOCK" | "LIBVIRT"): void {
  if (env.HYPERVISOR_PROVIDER === "libvirt" && providerType !== "LIBVIRT") {
    throw new HttpError(400, "VALIDATION_ERROR", "Storage pool belongs to a MOCK host but API is in LIBVIRT mode");
  }
  if (env.HYPERVISOR_PROVIDER === "mock" && providerType !== "MOCK") {
    throw new HttpError(400, "VALIDATION_ERROR", "Storage pool belongs to a LIBVIRT host but API is in MOCK mode");
  }
}
