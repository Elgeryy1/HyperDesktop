import { RoleName } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { getParam } from "../../common/params.js";
import { validateQuery } from "../../common/validate.js";
import { prisma } from "../../lib/prisma.js";

const auditQuerySchema = z.object({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  actorUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const auditLogsRouter = Router();

auditLogsRouter.use(requireAuth, requireRole([RoleName.ADMINISTRADOR]));

auditLogsRouter.get(
  "/",
  validateQuery(auditQuerySchema),
  asyncHandler(async (req, res) => {
    const { action, resourceType, actorUserId, limit } = auditQuerySchema.parse(req.query);

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(resourceType ? { resourceType } : {}),
        ...(actorUserId ? { actorUserId } : {})
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: limit
    });

    res.json(logs);
  })
);

auditLogsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    if (!log) {
      res.status(404).json({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Audit log not found"
      });
      return;
    }

    res.json(log);
  })
);
