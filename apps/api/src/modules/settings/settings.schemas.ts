import { z } from "zod";

export const updateSettingsSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  allowIsoUpload: z.boolean().optional(),
  defaultVmVcpu: z.number().int().min(1).max(16).optional(),
  defaultVmMemoryMb: z.number().int().min(512).max(65536).optional()
});

