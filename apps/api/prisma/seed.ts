import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleName } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const roleEntries = [
    { name: RoleName.ADMINISTRADOR, description: "Administrador de plataforma" },
    { name: RoleName.PROFESOR, description: "Profesor con gestion de laboratorios y plantillas" },
    { name: RoleName.ALUMNO, description: "Alumno con cuota limitada de recursos" }
  ];

  for (const role of roleEntries) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: {
        name: role.name,
        description: role.description,
        isSystem: true
      }
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMINISTRADOR } });
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@hyperdesk.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const isLibvirtMode = process.env.HYPERVISOR_PROVIDER === "libvirt";
  const defaultStoragePoolName = isLibvirtMode ? (process.env.LIBVIRT_STORAGE_POOL ?? "default") : "default-pool";
  const defaultNetworkName = isLibvirtMode ? (process.env.LIBVIRT_DEFAULT_NETWORK ?? "default") : "lab-nat";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      roleId: adminRole.id,
      status: "ACTIVE"
    },
    create: {
      email: adminEmail,
      name: "HyperDesk Admin",
      passwordHash,
      roleId: adminRole.id
    }
  });

  const defaultHost = await prisma.hypervisorHost.upsert({
    where: { name: "lab-host-01" },
    update: {
      status: "ONLINE",
      providerType: isLibvirtMode ? "LIBVIRT" : "MOCK",
      connectionUri: process.env.LIBVIRT_DEFAULT_URI ?? "qemu:///system"
    },
    create: {
      name: "lab-host-01",
      providerType: isLibvirtMode ? "LIBVIRT" : "MOCK",
      connectionUri: process.env.LIBVIRT_DEFAULT_URI ?? "qemu:///system",
      status: "ONLINE",
      cpuCoresTotal: 16,
      memoryMbTotal: 32768,
      storageGbTotal: 1024
    }
  });

  if (isLibvirtMode && defaultStoragePoolName !== "default-pool") {
    const currentPreferredPool = await prisma.storagePool.findUnique({
      where: {
        hostId_name: {
          hostId: defaultHost.id,
          name: defaultStoragePoolName
        }
      }
    });
    if (!currentPreferredPool) {
      await prisma.storagePool.updateMany({
        where: {
          hostId: defaultHost.id,
          name: "default-pool"
        },
        data: {
          name: defaultStoragePoolName
        }
      });
    }
  }

  await prisma.storagePool.upsert({
    where: {
      hostId_name: {
        hostId: defaultHost.id,
        name: defaultStoragePoolName
      }
    },
    update: {},
    create: {
      name: defaultStoragePoolName,
      type: "DIR",
      capacityGb: 1024,
      usedGb: 0,
      hostId: defaultHost.id
    }
  });

  if (isLibvirtMode && defaultNetworkName !== "lab-nat") {
    const currentPreferredNetwork = await prisma.network.findUnique({
      where: {
        name_hostId: {
          name: defaultNetworkName,
          hostId: defaultHost.id
        }
      }
    });
    if (!currentPreferredNetwork) {
      await prisma.network.updateMany({
        where: {
          hostId: defaultHost.id,
          name: "lab-nat"
        },
        data: {
          name: defaultNetworkName,
          cidr: "192.168.122.0/24",
          gatewayIp: "192.168.122.1"
        }
      });
    }
  }

  await prisma.network.upsert({
    where: {
      name_hostId: {
        name: defaultNetworkName,
        hostId: defaultHost.id
      }
    },
    update: {},
    create: {
      name: defaultNetworkName,
      type: "NAT",
      cidr: isLibvirtMode ? "192.168.122.0/24" : "10.60.20.0/24",
      gatewayIp: isLibvirtMode ? "192.168.122.1" : "10.60.20.1",
      hostId: defaultHost.id
    }
  });

  console.log(`[seed] admin user ensured: ${adminEmail}`);
  console.log("[seed] default host/network/storage ensured");
}

main()
  .catch((error) => {
    console.error("[seed] failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
