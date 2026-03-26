import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { validateBody } from "../../common/validate.js";
import { updateSettingsSchema } from "./settings.schemas.js";

const runtimeSettings = {
  maintenanceMode: false,
  allowIsoUpload: true,
  defaultVmVcpu: 2,
  defaultVmMemoryMb: 4096
};

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireRole([RoleName.ADMINISTRADOR]));

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(runtimeSettings);
  })
);

settingsRouter.patch(
  "/",
  validateBody(updateSettingsSchema),
  asyncHandler(async (req, res) => {
    Object.assign(runtimeSettings, req.body);
    await writeAuditLog({
      req,
      action: "settings.update",
      resourceType: "SETTINGS",
      message: "Runtime settings updated",
      metadata: runtimeSettings
    });
    res.json(runtimeSettings);
  })
);

