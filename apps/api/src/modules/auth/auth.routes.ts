import { RoleName } from "@prisma/client";
import { Router } from "express";
import { createHash } from "node:crypto";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth } from "../../common/auth.js";
import { HttpError } from "../../common/http-error.js";
import { validateBody } from "../../common/validate.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import { prisma } from "../../lib/prisma.js";
import { verifyPassword } from "../../lib/password.js";
import { loginSchema, logoutSchema, refreshSchema } from "./auth.schemas.js";
import { writeAuditLog } from "../../common/audit.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const authRouter = Router();

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });

    if (!user || user.status !== "ACTIVE") {
      await writeAuditLog({
        req,
        action: "auth.login",
        resourceType: "USER",
        message: "Invalid credentials",
        result: "FAILED",
        metadata: { email }
      });
      throw new HttpError(401, "UNAUTHORIZED", "Invalid credentials");
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      await writeAuditLog({
        req,
        actorUserId: user.id,
        action: "auth.login",
        resourceType: "USER",
        resourceId: user.id,
        message: "Invalid credentials",
        result: "FAILED"
      });
      throw new HttpError(401, "UNAUTHORIZED", "Invalid credentials");
    }

    const role = user.role.name as RoleName;
    const accessToken = signAccessToken({ sub: user.id, role });
    const refreshToken = signRefreshToken({ sub: user.id, role });

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    await writeAuditLog({
      req,
      actorUserId: user.id,
      action: "auth.login",
      resourceType: "USER",
      resourceId: user.id,
      message: "Login successful"
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name
      },
      accessToken,
      refreshToken
    });
  })
);

authRouter.post(
  "/refresh",
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    let payload: { sub: string; role: RoleName; type: "refresh" };
    try {
      payload = verifyRefreshToken(refreshToken) as { sub: string; role: RoleName; type: "refresh" };
    } catch {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid refresh token");
    }
    if (payload.type !== "refresh") {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid refresh token");
    }

    const existingSession = await prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: {
        user: {
          include: {
            role: true
          }
        }
      }
    });

    if (
      !existingSession ||
      existingSession.revokedAt ||
      existingSession.expiresAt < new Date() ||
      existingSession.userId !== payload.sub ||
      existingSession.user.status !== "ACTIVE"
    ) {
      throw new HttpError(401, "UNAUTHORIZED", "Refresh token expired or revoked");
    }

    const role = existingSession.user.role.name as RoleName;
    const accessToken = signAccessToken({
      sub: existingSession.user.id,
      role
    });
    const newRefreshToken = signRefreshToken({
      sub: existingSession.user.id,
      role
    });

    await prisma.session.update({
      where: { id: existingSession.id },
      data: {
        refreshTokenHash: hashToken(newRefreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      accessToken,
      refreshToken: newRefreshToken
    });
  })
);

authRouter.post(
  "/logout",
  validateBody(logoutSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const session = await prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) }
    });

    if (session && !session.revokedAt) {
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });
    }

    if (req.user?.id) {
      await writeAuditLog({
        req,
        actorUserId: req.user.id,
        action: "auth.logout",
        resourceType: "USER",
        resourceId: req.user.id,
        message: "Logout successful"
      });
    }

    res.status(204).send();
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { role: true }
    });

    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name
    });
  })
);
