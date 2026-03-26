import type { AuditActionResult, Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../lib/prisma.js";

type AuditInput = {
  req?: Request;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  message?: string;
  result?: AuditActionResult;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? input.req?.user?.id ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      message: input.message,
      result: input.result ?? "SUCCESS",
      ipAddress: input.req?.ip ?? null,
      metadata: input.metadata ?? undefined
    }
  });
}

