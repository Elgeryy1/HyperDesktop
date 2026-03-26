import type { NextFunction, Request, Response } from "express";
import type { RoleName } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt.js";
import { HttpError } from "./http-error.js";
import { prisma } from "../lib/prisma.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new HttpError(401, "UNAUTHORIZED", "Missing bearer token"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== "access") {
      next(new HttpError(401, "UNAUTHORIZED", "Invalid token"));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true }
    });
    if (!user || user.status !== "ACTIVE") {
      next(new HttpError(401, "UNAUTHORIZED", "Invalid token"));
      return;
    }

    req.user = {
      id: user.id,
      role: user.role.name as RoleName
    };
    next();
  } catch {
    next(new HttpError(401, "UNAUTHORIZED", "Invalid token"));
  }
}

export function requireRole(allowed: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, "UNAUTHORIZED", "Not authenticated"));
      return;
    }

    if (!allowed.includes(req.user.role)) {
      next(new HttpError(403, "FORBIDDEN", "Insufficient permissions"));
      return;
    }

    next();
  };
}
