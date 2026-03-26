import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  password: z.string().min(8).max(128),
  roleName: z.enum(["ADMINISTRADOR", "PROFESOR", "ALUMNO"])
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  roleName: z.enum(["ADMINISTRADOR", "PROFESOR", "ALUMNO"]).optional()
});
