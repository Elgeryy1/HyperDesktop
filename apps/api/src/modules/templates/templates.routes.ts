import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody } from "../../common/validate.js";
import { prisma } from "../../lib/prisma.js";
import { assignTemplateSchema, createTemplateSchema } from "./templates.schemas.js";

export const templatesRouter = Router();

templatesRouter.use(requireAuth);

templatesRouter.get(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const userId = req.user!.id;

    const where =
      role === RoleName.ADMINISTRADOR
        ? {}
        : role === RoleName.PROFESOR
          ? {
              createdById: userId
            }
          : {
              assignments: {
                some: {
                  studentId: userId
                }
              }
            };

    const templates = await prisma.template.findMany({
      where,
      include: {
        iso: {
          select: {
            id: true,
            name: true,
            version: true,
            osFamily: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        assignments: role === RoleName.ALUMNO
          ? false
          : {
              include: {
                student: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              },
              orderBy: {
                createdAt: "desc"
              }
            }
      },
      orderBy: [{ name: "asc" }, { version: "desc" }]
    });
    res.json(templates);
  })
);

templatesRouter.post(
  "/",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  validateBody(createTemplateSchema),
  asyncHandler(async (req, res) => {
    if (req.body.isoId) {
      const iso = await prisma.isoImage.findUnique({ where: { id: req.body.isoId } });
      if (!iso) {
        throw new HttpError(400, "VALIDATION_ERROR", "ISO not found");
      }
    }

    const template = await prisma.template.create({
      data: {
        name: req.body.name,
        version: req.body.version,
        sourceType: req.body.sourceType,
        createdById: req.user!.id,
        isoId: req.body.isoId,
        defaultVcpu: req.body.defaultVcpu ?? 2,
        defaultMemoryMb: req.body.defaultMemoryMb ?? 4096,
        defaultDiskGb: req.body.defaultDiskGb ?? 40,
        cloudInit: req.body.cloudInit
      }
    });

    await writeAuditLog({
      req,
      action: "template.create",
      resourceType: "TEMPLATE",
      resourceId: template.id,
      message: `Template ${template.name}:${template.version} created`
    });

    res.status(201).json(template);
  })
);

templatesRouter.delete(
  "/:id",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new HttpError(404, "NOT_FOUND", "Template not found");
    }
    if (req.user!.role === RoleName.PROFESOR && template.createdById !== req.user!.id) {
      throw new HttpError(403, "FORBIDDEN", "You can only delete templates created by your account");
    }

    await prisma.template.delete({ where: { id } });
    await writeAuditLog({
      req,
      action: "template.delete",
      resourceType: "TEMPLATE",
      resourceId: id,
      message: `Template ${template.name}:${template.version} deleted`
    });

    res.status(204).send();
  })
);

templatesRouter.get(
  "/:id/assignments",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new HttpError(404, "NOT_FOUND", "Template not found");
    }
    if (req.user!.role === RoleName.PROFESOR && template.createdById !== req.user!.id) {
      throw new HttpError(403, "FORBIDDEN", "You can only view assignments for your templates");
    }

    const assignments = await prisma.templateAssignment.findMany({
      where: { templateId: template.id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        assignedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(assignments);
  })
);

templatesRouter.post(
  "/:id/assignments",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  validateBody(assignTemplateSchema),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new HttpError(404, "NOT_FOUND", "Template not found");
    }
    if (req.user!.role === RoleName.PROFESOR && template.createdById !== req.user!.id) {
      throw new HttpError(403, "FORBIDDEN", "You can only assign templates created by your account");
    }

    const student = await prisma.user.findUnique({
      where: { id: req.body.studentId },
      include: { role: true }
    });
    if (!student) {
      throw new HttpError(404, "NOT_FOUND", "Student user not found");
    }
    if (student.role.name !== RoleName.ALUMNO) {
      throw new HttpError(400, "VALIDATION_ERROR", "Template can only be assigned to ALUMNO users");
    }

    const assignment = await prisma.templateAssignment.upsert({
      where: {
        templateId_studentId: {
          templateId: template.id,
          studentId: student.id
        }
      },
      update: {
        assignedById: req.user!.id
      },
      create: {
        templateId: template.id,
        studentId: student.id,
        assignedById: req.user!.id
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    await writeAuditLog({
      req,
      action: "template.assign",
      resourceType: "TEMPLATE",
      resourceId: template.id,
      message: `Template ${template.name}:${template.version} assigned to ${student.email}`
    });

    res.status(201).json(assignment);
  })
);

templatesRouter.delete(
  "/:id/assignments/:studentId",
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const studentId = getParam(req.params.studentId, "studentId");

    const template = await prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new HttpError(404, "NOT_FOUND", "Template not found");
    }
    if (req.user!.role === RoleName.PROFESOR && template.createdById !== req.user!.id) {
      throw new HttpError(403, "FORBIDDEN", "You can only edit assignments for your templates");
    }

    await prisma.templateAssignment.deleteMany({
      where: {
        templateId: id,
        studentId
      }
    });

    await writeAuditLog({
      req,
      action: "template.unassign",
      resourceType: "TEMPLATE",
      resourceId: id,
      message: `Template assignment removed for student ${studentId}`
    });

    res.status(204).send();
  })
);
