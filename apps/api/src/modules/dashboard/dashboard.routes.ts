import { RoleName } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { prisma } from "../../lib/prisma.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole([RoleName.ADMINISTRADOR, RoleName.PROFESOR, RoleName.ALUMNO]));

dashboardRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [totalVms, runningVms, totalHosts, onlineHosts, totalUsers] = await Promise.all([
      prisma.virtualMachine.count({ where: { deletedAt: null } }),
      prisma.virtualMachine.count({
        where: {
          state: "RUNNING",
          deletedAt: null
        }
      }),
      prisma.hypervisorHost.count(),
      prisma.hypervisorHost.count({ where: { status: "ONLINE" } }),
      prisma.user.count()
    ]);

    res.json({
      totalVms,
      runningVms,
      totalHosts,
      onlineHosts,
      totalUsers
    });
  })
);

dashboardRouter.get(
  "/resources",
  asyncHandler(async (_req, res) => {
    const hosts = await prisma.hypervisorHost.findMany({
      include: {
        _count: {
          select: {
            virtualMachines: true
          }
        }
      }
    });

    const cpuTotal = hosts.reduce((acc, item) => acc + item.cpuCoresTotal, 0);
    const memoryTotalMb = hosts.reduce((acc, item) => acc + item.memoryMbTotal, 0);
    const storageTotalGb = hosts.reduce((acc, item) => acc + item.storageGbTotal, 0);
    const vmCount = hosts.reduce((acc, item) => acc + item._count.virtualMachines, 0);

    res.json({
      cpuTotal,
      memoryTotalMb,
      storageTotalGb,
      vmCount
    });
  })
);

