import { createHash, randomUUID } from "node:crypto";
import { createReadStream, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { env } from "../../lib/env.js";

const uploadDir = path.resolve(env.ISO_UPLOAD_DIR);
mkdirSync(uploadDir, { recursive: true });

function sanitizeFilename(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDir);
  },
  filename: (_req, file, callback) => {
    const safeName = sanitizeFilename(file.originalname);
    callback(null, `${Date.now()}-${randomUUID()}-${safeName}`);
  }
});

export const isoUploadMiddleware = multer({
  storage,
  limits: {
    fileSize: env.ISO_MAX_SIZE_MB * 1024 * 1024
  }
}).single("iso");

export async function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", (error) => {
      reject(error);
    });
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

export async function removeUploadedFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Ignore file cleanup errors.
  }
}

