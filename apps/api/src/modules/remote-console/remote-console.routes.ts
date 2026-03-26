import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { writeAuditLog } from "../../common/audit.js";
import { HttpError } from "../../common/http-error.js";
import { getParam } from "../../common/params.js";
import { validateBody } from "../../common/validate.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { getHypervisorProvider } from "../virtual-machines/providers/factory.js";
import { createConsoleSessionSchema } from "./remote-console.schemas.js";
import { createRdpTunnelViaLibvirtSsh } from "./rdp-tunnel.js";
import {
  buildVncProxyWsUrl,
  createRemoteConsoleSession,
  deleteRemoteConsoleSession,
  getRemoteConsoleSession,
  validateRemoteConsoleSession
} from "./remote-console.store.js";

export const remoteConsoleRouter = Router();
const provider = getHypervisorProvider();

remoteConsoleRouter.post(
  "/sessions",
  requireAuth,
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  validateBody(createConsoleSessionSchema),
  asyncHandler(async (req, res) => {
    const vm = await prisma.virtualMachine.findUnique({
      where: { id: req.body.vmId },
      include: {
        host: true
      }
    });

    if (!vm || vm.deletedAt) {
      throw new HttpError(404, "NOT_FOUND", "VM not found");
    }

    const vmRuntime = await hydrateVmForConsole(vm);
    if (vmRuntime.state !== "RUNNING") {
      throw new HttpError(409, "CONFLICT", "VM must be RUNNING before opening console");
    }

    const protocol = req.body.protocol as "VNC" | "RDP";
    let target: ResolvedConsoleTarget;
    try {
      target = await resolveConsoleTarget({
        provider,
        protocol,
        vmExternalId: vm.externalId,
        vmIpAddress: vmRuntime.ipAddress,
        hostConnectionUri: vm.host.connectionUri,
        hostName: vm.host.name,
        requestHost: req.hostname
      });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Hypervisor console target resolution failed";
      throw new HttpError(502, "HYPERVISOR_UNAVAILABLE", message);
    }

    let session;
    try {
      session = createRemoteConsoleSession({
        vmId: vm.id,
        protocol,
        targetHost: target.host,
        targetPort: target.port,
        createdById: req.user!.id,
        dispose: target.dispose
      });
    } catch (error) {
      target.dispose?.();
      throw error;
    }

    await writeAuditLog({
      req,
      action: "remote_console.create_session",
      resourceType: "VM",
      resourceId: vm.id,
      message: `Remote console (${protocol}) session created for VM ${vm.name}`
    });

    res.status(201).json({
      id: session.id,
      vmId: session.vmId,
      protocol: session.protocol,
      expiresAt: session.expiresAt,
      launchUrl: session.launchUrl,
      vncWsUrl: session.protocol === "VNC" ? buildVncProxyWsUrl(session) : null
    });
  })
);

remoteConsoleRouter.get(
  "/sessions/:id",
  requireAuth,
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const session = getRemoteConsoleSession(id);
    if (!session) {
      throw new HttpError(404, "NOT_FOUND", "Console session not found");
    }

    res.json({
      id: session.id,
      vmId: session.vmId,
      protocol: session.protocol,
      expiresAt: session.expiresAt,
      launchUrl: session.launchUrl,
      vncWsUrl: session.protocol === "VNC" ? buildVncProxyWsUrl(session) : null
    });
  })
);

remoteConsoleRouter.get(
  "/sessions/:id/rdp-file",
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    const token = String(req.query.token ?? "");

    const session = validateRemoteConsoleSession({
      id,
      token,
      protocol: "RDP"
    });
    if (!session) {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired console token");
    }

    const vm = await prisma.virtualMachine.findUnique({
      where: { id: session.vmId }
    });
    const directVmAddress = vm?.ipAddress ? `${vm.ipAddress}:${env.DEFAULT_RDP_PORT}` : null;
    const tunnelAddress = `${session.targetHost}:${session.targetPort}`;
    const hasTunnelTarget =
      !!directVmAddress &&
      (session.targetHost !== vm?.ipAddress || session.targetPort !== env.DEFAULT_RDP_PORT);

    const fullAddress = hasTunnelTarget ? tunnelAddress : directVmAddress ?? tunnelAddress;
    const alternateAddress = hasTunnelTarget ? directVmAddress : null;

    const rdpContent = [
      `full address:s:${fullAddress}`,
      "prompt for credentials:i:1",
      "screen mode id:i:2",
      "smart sizing:i:1",
      alternateAddress ? `alternate full address:s:${alternateAddress}` : "",
      vm?.name ? `remoteapplicationname:s:${vm.name}` : ""
    ]
      .filter(Boolean)
      .join("\r\n");

    res.setHeader("Content-Type", "application/x-rdp");
    res.setHeader("Content-Disposition", `attachment; filename="${vm?.name ?? "hyperdesk"}.rdp"`);
    res.send(rdpContent);
  })
);

remoteConsoleRouter.delete(
  "/sessions/:id",
  requireAuth,
  requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR]),
  asyncHandler(async (req, res) => {
    const id = getParam(req.params.id, "id");
    deleteRemoteConsoleSession(id);
    res.status(204).send();
  })
);

async function resolveConsoleTarget(input: {
  provider: ReturnType<typeof getHypervisorProvider>;
  protocol: "VNC" | "RDP";
  vmExternalId: string | null;
  vmIpAddress: string | null;
  hostConnectionUri: string;
  hostName: string;
  requestHost?: string;
}): Promise<ResolvedConsoleTarget> {
  if (input.protocol === "VNC") {
    if (input.vmExternalId && input.provider.getVncTarget) {
      const vncTarget = await input.provider.getVncTarget(input.vmExternalId, {
        connectionUri: input.hostConnectionUri,
        hostName: input.hostName
      });
      if (vncTarget) {
        return vncTarget;
      }
    }

    if (env.HYPERVISOR_PROVIDER === "mock") {
      return {
        host: env.MOCK_VNC_TARGET_HOST,
        port: env.MOCK_VNC_TARGET_PORT
      };
    }

    if (!input.vmIpAddress) {
      throw new HttpError(409, "CONFLICT", "VM has no IP address for VNC connection");
    }

    return {
      host: input.vmIpAddress,
      port: env.DEFAULT_VNC_PORT
    };
  }

  if (!input.vmIpAddress) {
    throw new HttpError(409, "CONFLICT", "VM has no IP address for RDP connection");
  }

  if (env.REMOTE_CONSOLE_RDP_TUNNEL_MODE === "libvirt_ssh" && env.HYPERVISOR_PROVIDER === "libvirt") {
    const tunnelTarget = await createRdpTunnelViaLibvirtSsh({
      connectionUri: input.hostConnectionUri,
      vmIpAddress: input.vmIpAddress,
      vmRdpPort: env.DEFAULT_RDP_PORT,
      publicHost: input.requestHost
    });
    if (tunnelTarget) {
      return tunnelTarget;
    }
  }

  return {
    host: input.vmIpAddress,
    port: env.DEFAULT_RDP_PORT
  };
}

type ResolvedConsoleTarget = {
  host: string;
  port: number;
  dispose?: () => void;
};

type ConsoleVmSnapshot = {
  id: string;
  state: string;
  ipAddress: string | null;
  externalId: string | null;
  host: {
    name: string;
    connectionUri: string;
    providerType: "MOCK" | "LIBVIRT";
  };
};

async function hydrateVmForConsole(vm: ConsoleVmSnapshot): Promise<{ state: string; ipAddress: string | null }> {
  if (!provider.getVmRuntime || !vm.externalId) {
    return {
      state: vm.state,
      ipAddress: vm.ipAddress
    };
  }

  if (env.HYPERVISOR_PROVIDER === "libvirt" && vm.host.providerType !== "LIBVIRT") {
    return {
      state: vm.state,
      ipAddress: vm.ipAddress
    };
  }
  if (env.HYPERVISOR_PROVIDER === "mock" && vm.host.providerType !== "MOCK") {
    return {
      state: vm.state,
      ipAddress: vm.ipAddress
    };
  }

  try {
    const runtime = await provider.getVmRuntime(vm.externalId, {
      connectionUri: vm.host.connectionUri,
      hostName: vm.host.name
    });
    if (!runtime) {
      return {
        state: vm.state,
        ipAddress: vm.ipAddress
      };
    }

    const nextState = runtime.state;
    const nextIpAddress = nextState === "RUNNING" ? runtime.ipAddress ?? vm.ipAddress : null;

    if (nextState !== vm.state || nextIpAddress !== vm.ipAddress) {
      await prisma.virtualMachine.update({
        where: { id: vm.id },
        data: {
          state: nextState,
          ipAddress: nextIpAddress
        }
      });
    }

    return {
      state: nextState,
      ipAddress: nextIpAddress
    };
  } catch {
    return {
      state: vm.state,
      ipAddress: vm.ipAddress
    };
  }
}
