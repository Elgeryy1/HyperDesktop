import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(2).max(120),
  version: z.string().min(1).max(50),
  sourceType: z.enum(["ISO", "VM"]),
  isoId: z.string().uuid().optional(),
  defaultVcpu: z.number().int().min(1).max(64).optional(),
  defaultMemoryMb: z.number().int().min(512).max(262144).optional(),
  defaultDiskGb: z.number().int().min(5).max(2048).optional(),
  cloudInit: z.record(z.unknown()).optional()
});

export const createTemplateFromVmSchema = z.object({
  name: z.string().min(2).max(120),
  version: z.string().min(1).max(50).optional()
});

export const assignTemplateSchema = z.object({
  studentId: z.string().uuid()
});
