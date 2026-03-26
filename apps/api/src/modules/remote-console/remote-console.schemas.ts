import { z } from "zod";

export const createConsoleSessionSchema = z.object({
  vmId: z.string().uuid(),
  protocol: z.enum(["VNC", "RDP"]).default("VNC")
});
