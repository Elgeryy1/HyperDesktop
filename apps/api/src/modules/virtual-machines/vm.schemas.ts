import { z } from "zod";

const expirationActionSchema = z.enum(["STOP", "DELETE"]);

const vmScheduleFieldsSchema = z.object({
  autoStopAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  expirationAction: expirationActionSchema.optional()
});

const validateScheduleWindow = <T extends { autoStopAt?: Date | null; expiresAt?: Date | null }>(payload: T): boolean => {
  if (!payload.autoStopAt || !payload.expiresAt) {
    return true;
  }
  return payload.expiresAt.getTime() >= payload.autoStopAt.getTime();
};

export const createVmSchema = z.object({
  name: z.string().min(2).max(80),
  vcpu: z.number().int().min(1).max(64).optional(),
  memoryMb: z.number().int().min(512).max(262144).optional(),
  diskGb: z.number().int().min(5).max(2048).optional(),
  hostId: z.string().uuid(),
  networkId: z.string().uuid().optional(),
  isoId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  osType: z.string().min(2).max(80).optional(),
  autoStopAt: vmScheduleFieldsSchema.shape.autoStopAt,
  expiresAt: vmScheduleFieldsSchema.shape.expiresAt,
  expirationAction: vmScheduleFieldsSchema.shape.expirationAction
}).refine((payload) => {
  if (payload.templateId) {
    return true;
  }
  return payload.vcpu !== undefined && payload.memoryMb !== undefined && payload.diskGb !== undefined;
}, {
  message: "vcpu, memoryMb and diskGb are required when templateId is not provided",
  path: ["templateId"]
}).refine(validateScheduleWindow, {
  message: "expiresAt must be greater than or equal to autoStopAt",
  path: ["expiresAt"]
});

export const updateVmSchema = z.object({
  osType: z.string().min(2).max(80).optional(),
  networkId: z.string().uuid().nullable().optional()
});

export const updateVmHardwareSchema = z
  .object({
    vcpu: z.number().int().min(1).max(64).optional(),
    memoryMb: z.number().int().min(512).max(262144).optional(),
    diskGb: z.number().int().min(5).max(2048).optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one hardware field is required"
  });

export const addVmDiskSchema = z.object({
  sizeGb: z.number().int().min(1).max(2048),
  storagePoolId: z.string().uuid().optional(),
  format: z.enum(["qcow2", "raw"]).default("qcow2"),
  name: z.string().min(2).max(128).optional()
});

export const updateVmScheduleSchema = vmScheduleFieldsSchema
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one scheduling field is required"
  })
  .refine(validateScheduleWindow, {
    message: "expiresAt must be greater than or equal to autoStopAt",
    path: ["expiresAt"]
  });

export const extendVmScheduleSchema = z.object({
  minutes: z.number().int().min(1).max(60 * 24 * 30),
  target: z.enum(["autoStopAt", "expiresAt"]).default("expiresAt")
});

export const runSchedulerNowSchema = z.object({
  limit: z.number().int().min(1).max(500).optional()
}).default({});

export const listVmQuerySchema = z.object({
  state: z
    .enum(["PROVISIONING", "STOPPED", "STARTING", "RUNNING", "STOPPING", "REBOOTING", "ERROR", "DELETING", "DELETED"])
    .optional(),
  search: z.string().optional()
});
