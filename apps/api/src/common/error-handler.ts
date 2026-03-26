import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpError } from "./http-error.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, "NOT_FOUND", `Route not found: ${req.method} ${req.path}`));
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details ?? null
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    res.status(400).json({
      statusCode: 400,
      code: "UPLOAD_ERROR",
      message: error.message,
      details: {
        field: error.field
      }
    });
    return;
  }

  if (error instanceof Error && "code" in error && typeof error.code === "string" && error.code === "ENOSPC") {
    res.status(507).json({
      statusCode: 507,
      code: "INSUFFICIENT_STORAGE",
      message: "Not enough disk space on server to store the uploaded ISO",
      details: null
    });
    return;
  }

  console.error("[error]", error);
  res.status(500).json({
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: null
  });
}
