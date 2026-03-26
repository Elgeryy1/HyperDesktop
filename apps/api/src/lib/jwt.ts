import jwt from "jsonwebtoken";
import { RoleName } from "@prisma/client";
import { env } from "./env.js";

export type JwtPayload = {
  sub: string;
  role: RoleName;
  type: "access" | "refresh";
};

export function signAccessToken(payload: Omit<JwtPayload, "type">): string {
  const expiresIn = env.JWT_ACCESS_EXPIRES as jwt.SignOptions["expiresIn"];
  return jwt.sign(
    {
      ...payload,
      type: "access"
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn }
  );
}

export function signRefreshToken(payload: Omit<JwtPayload, "type">): string {
  const expiresIn = env.JWT_REFRESH_EXPIRES as jwt.SignOptions["expiresIn"];
  return jwt.sign(
    {
      ...payload,
      type: "refresh"
    },
    env.JWT_REFRESH_SECRET,
    { expiresIn }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}
