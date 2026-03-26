import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody } from "../../common/validate.js";
import { prisma } from "../../lib/prisma.js";
import { addGroupMemberSchema, createGroupSchema, updateGroupSchema } from "./groups.schemas.js";

export const groupsRouter = Router();

groupsRouter.use(requireAuth, requireRole([RoleName.ADMINISTRADOR]));

groupsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(groups);
  })
);

groupsRouter.post(
  "/",
  validateBody(createGroupSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.group.findFirst({
      where: {
        OR: [{ name: req.body.name }, { slug: req.body.slug }]
      }
    });
    if (existing) {
      throw new HttpError(409, "CONFLICT", "Group already exists");
    }

    const group = await prisma.group.create({
      data: req.body
    });

    await writeAuditLog({
      req,
      action: "group.create",
      resourceType: "GROUP",
      resourceId: group.id,
      message: `Group ${group.name} created`
    });

    res.status(201).json(group);
  })
);

groupsRouter.patch(
  "/:id",
  validateBody(updateGroupSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) {
      throw new HttpError(404, "NOT_FOUND", "Group not found");
    }

    const updated = await prisma.group.update({
      where: { id },
      data: req.body
    });

    await writeAuditLog({
      req,
      action: "group.update",
      resourceType: "GROUP",
      resourceId: updated.id,
      message: `Group ${updated.name} updated`
    });

    res.json(updated);
  })
);

groupsRouter.post(
  "/:id/members",
  validateBody(addGroupMemberSchema),
  asyncHandler(async (req, res) => {
    const groupId = getParam(req.params.id, "id");
    const { userId } = req.body;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new HttpError(404, "NOT_FOUND", "Group not found");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    const member = await prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId,
          userId
        }
      },
      update: {},
      create: {
        groupId,
        userId
      }
    });

    await writeAuditLog({
      req,
      action: "group.add_member",
      resourceType: "GROUP",
      resourceId: groupId,
      message: `User ${user.email} added to group ${group.name}`
    });

    res.status(201).json(member);
  })
);

groupsRouter.delete(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    const groupId = getParam(req.params.id, "id");
    const userId = getParam(req.params.userId, "userId");

    await prisma.groupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId
        }
      }
    });

    await writeAuditLog({
      req,
      action: "group.remove_member",
      resourceType: "GROUP",
      resourceId: groupId,
      message: `User removed from group`
    });

    res.status(204).send();
  })
);

