import { RoleName } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody } from "../../common/validate.js";
import { prisma } from "../../lib/prisma.js";

const updateRoleSchema = z.object({
  description: z.string().min(3).max(255)
});

export const rolesRouter = Router();

rolesRouter.use(requireAuth, requireRole([RoleName.ADMINISTRADOR]));

rolesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" }
    });

    res.json(roles);
  })
);

rolesRouter.patch(
  "/:name",
  validateBody(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const roleName = getParam(req.params.name, "name").toUpperCase() as RoleName;
    if (!Object.values(RoleName).includes(roleName)) {
      throw new HttpError(400, "VALIDATION_ERROR", "Role not supported");
    }

    const role = await prisma.role.update({
      where: { name: roleName },
      data: { description: req.body.description }
    });

    res.json(role);
  })
);
