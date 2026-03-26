import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody } from "../../common/validate.js";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { createUserSchema, updateUserSchema } from "./users.schemas.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  asyncHandler(async (req, res) => {
    const where =
      req.user!.role === RoleName.PROFESOR ? { role: { is: { name: RoleName.ALUMNO } } } : undefined;
    const users = await prisma.user.findMany({
      where,
      include: { role: true },
      orderBy: { createdAt: "desc" }
    });

    res.json(
      users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        role: user.role.name,
        createdAt: user.createdAt
      }))
    );
  })
);

usersRouter.post(
  "/",
  requireRole([RoleName.ADMINISTRADOR]),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const { email, name, password, roleName } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new HttpError(409, "CONFLICT", "User already exists");
    }

    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid role");
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        roleId: role.id
      },
      include: { role: true }
    });

    await writeAuditLog({
      req,
      action: "user.create",
      resourceType: "USER",
      resourceId: user.id,
      message: `User ${email} created`
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      role: user.role.name
    });
  })
);

usersRouter.get(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const user = await prisma.user.findUnique({
      where: { id },
      include: { role: true }
    });
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      role: user.role.name,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    });
  })
);

usersRouter.patch(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR]),
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const { roleName, ...data } = req.body as { roleName?: RoleName; name?: string; status?: "ACTIVE" | "SUSPENDED" };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    let roleId: string | undefined;
    if (roleName) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) {
        throw new HttpError(400, "VALIDATION_ERROR", "Invalid role");
      }
      roleId = role.id;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(roleId ? { roleId } : {})
      },
      include: { role: true }
    });

    await writeAuditLog({
      req,
      action: "user.update",
      resourceType: "USER",
      resourceId: updatedUser.id,
      message: `User ${updatedUser.email} updated`
    });

    res.json({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      status: updatedUser.status,
      role: updatedUser.role.name
    });
  })
);

usersRouter.delete(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    await prisma.user.delete({
      where: { id }
    });

    await writeAuditLog({
      req,
      action: "user.delete",
      resourceType: "USER",
      resourceId: user.id,
      message: `User ${user.email} deleted`
    });

    res.status(204).send();
  })
);
