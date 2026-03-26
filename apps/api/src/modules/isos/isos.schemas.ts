import { z } from "zod";

export const createIsoSchema = z.object({
  name: z.string().min(2).max(120),
  version: z.string().max(50).optional(),
  osFamily: z.string().max(50).optional(),
  checksumSha256: z.string().min(32).max(128),
  sizeBytes: z.coerce.bigint(),
  storagePoolId: z.string().uuid(),
  path: z.string().min(2)
});

export const uploadIsoMetadataSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  version: z.string().max(50).optional(),
  osFamily: z.string().max(50).optional(),
  storagePoolId: z.string().uuid().optional()
});
