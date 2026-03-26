import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const parseBoolean = (value: unknown): unknown => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return value;
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  HYPERVISOR_PROVIDER: z.enum(["mock", "libvirt"]).default("mock"),
  ISO_UPLOAD_DIR: z.preprocess(emptyToUndefined, z.string().default("./uploads/isos")),
  ISO_MAX_SIZE_MB: z.preprocess(emptyToUndefined, z.coerce.number().int().min(10).max(102400).default(10240)),
  API_REQUEST_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(86400000).default(0)),
  VM_SCHEDULER_ENABLED: z.preprocess((value) => parseBoolean(emptyToUndefined(value)), z.boolean().default(true)),
  VM_SCHEDULER_INTERVAL_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(5000).max(3600000).default(15000)),
  VM_SCHEDULER_BATCH_SIZE: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(500).default(50)),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  WEB_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  REMOTE_CONSOLE_TTL_SECONDS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(30).max(86400).default(900)),
  REMOTE_CONSOLE_RDP_TUNNEL_MODE: z.preprocess(emptyToUndefined, z.enum(["disabled", "libvirt_ssh"]).default("libvirt_ssh")),
  REMOTE_CONSOLE_RDP_TUNNEL_PUBLIC_HOST: z.preprocess(emptyToUndefined, z.string().default("auto")),
  REMOTE_CONSOLE_RDP_TUNNEL_PORT_START: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1024).max(65535).default(13389)),
  REMOTE_CONSOLE_RDP_TUNNEL_PORT_END: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1024).max(65535).default(13489)),
  REMOTE_CONSOLE_RDP_TUNNEL_READY_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1000).max(60000).default(8000)
  ),
  MOCK_VNC_TARGET_HOST: z.preprocess(emptyToUndefined, z.string().default("mock-vnc")),
  MOCK_VNC_TARGET_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(5900)),
  DEFAULT_VNC_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(5900)),
  DEFAULT_RDP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(3389)),
  LIBVIRT_DEFAULT_URI: z.preprocess(emptyToUndefined, z.string().default("qemu:///system")),
  LIBVIRT_STORAGE_POOL: z.preprocess(emptyToUndefined, z.string().default("default")),
  LIBVIRT_DEFAULT_NETWORK: z.preprocess(emptyToUndefined, z.string().default("default")),
  LIBVIRT_VM_NAME_PREFIX: z.preprocess(emptyToUndefined, z.string().default("hd")),
  LIBVIRT_DISK_BUS: z.preprocess(emptyToUndefined, z.enum(["sata", "virtio"]).default("sata")),
  LIBVIRT_NIC_MODEL: z.preprocess(emptyToUndefined, z.enum(["e1000", "virtio", "rtl8139"]).default("e1000")),
  LIBVIRT_VNC_LISTEN_ADDRESS: z.preprocess(emptyToUndefined, z.string().default("0.0.0.0")),
  LIBVIRT_VIDEO_MODEL: z.preprocess(emptyToUndefined, z.enum(["vga", "virtio", "qxl"]).default("vga")),
  LIBVIRT_WINDOWS_VIDEO_MODEL: z.preprocess(emptyToUndefined, z.enum(["vga", "virtio", "qxl"]).default("qxl")),
  LIBVIRT_SOUND_MODEL: z.preprocess(emptyToUndefined, z.enum(["ich9", "ich6", "ac97", "es1370", "none"]).default("ich9")),
  LIBVIRT_VNC_HOST_OVERRIDE: z.preprocess(emptyToUndefined, z.string().optional()),
  LIBVIRT_VNC_HOST_FALLBACK: z.preprocess(emptyToUndefined, z.string().default("127.0.0.1")),
  LIBVIRT_COMMAND_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1000).max(600000).default(120000)),
  LIBVIRT_ISO_UPLOAD_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(60000).max(86400000).default(7200000))
}).refine((value) => value.REMOTE_CONSOLE_RDP_TUNNEL_PORT_START <= value.REMOTE_CONSOLE_RDP_TUNNEL_PORT_END, {
  path: ["REMOTE_CONSOLE_RDP_TUNNEL_PORT_START"],
  message: "REMOTE_CONSOLE_RDP_TUNNEL_PORT_START must be <= REMOTE_CONSOLE_RDP_TUNNEL_PORT_END"
});

export const env = envSchema.parse(process.env);
