import { z } from "zod";

export const createStoragePoolSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(["DIR", "NFS", "LVM", "ZFS"]),
  capacityGb: z.number().int().min(1),
  hostId: z.string().uuid()
});

export const createDiskVolumeSchema = z.object({
  name: z.string().min(2).max(120),
  sizeGb: z.number().int().min(1),
  format: z.string().min(2).max(20).default("qcow2"),
  storagePoolId: z.string().uuid(),
  vmId: z.string().uuid().optional(),
  isBoot: z.boolean().optional()
});

