import { z } from "zod";

export const createHypervisorSchema = z.object({
  name: z.string().min(1).max(100),
  providerType: z.enum(["MOCK", "LIBVIRT"]),
  connectionUri: z.string().min(2).optional(),
  cpuCoresTotal: z.number().int().min(1),
  memoryMbTotal: z.number().int().min(1024),
  storageGbTotal: z.number().int().min(20)
});

export const updateHypervisorSchema = z.object({
  status: z.enum(["ONLINE", "OFFLINE", "MAINTENANCE"]).optional(),
  connectionUri: z.string().min(2).optional(),
  cpuCoresTotal: z.number().int().min(1).optional(),
  memoryMbTotal: z.number().int().min(1024).optional(),
  storageGbTotal: z.number().int().min(20).optional()
});
