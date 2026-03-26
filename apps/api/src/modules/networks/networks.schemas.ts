import { z } from "zod";

export const createNetworkSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["BRIDGE", "NAT", "VLAN", "INTERNAL"]),
  cidr: z.string().min(7).max(50).optional(),
  gatewayIp: z.string().max(50).optional(),
  vlanId: z.number().int().min(1).max(4094).optional(),
  hostId: z.string().uuid().optional(),
  autoConfigure: z.boolean().optional().default(true)
});

export const updateNetworkSchema = z.object({
  cidr: z.string().min(7).max(50).optional(),
  gatewayIp: z.string().max(50).optional(),
  vlanId: z.number().int().min(1).max(4094).optional()
});
