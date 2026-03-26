import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100),
  description: z.string().max(255).optional()
});

export const updateGroupSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(255).optional()
});

export const addGroupMemberSchema = z.object({
  userId: z.string().uuid()
});

