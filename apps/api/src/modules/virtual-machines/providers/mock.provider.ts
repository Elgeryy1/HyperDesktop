import { randomUUID } from "node:crypto";
import type {
  AttachProviderDiskInput,
  HypervisorProvider,
  ProviderAttachedDisk,
  ProviderVm,
  ProviderVmRuntime,
  UpdateProviderVmInput,
  CreateProviderVmInput
} from "./types.js";
import type { ProviderHostContext, VncTarget } from "./types.js";
import { env } from "../../../lib/env.js";

const vmStore = new Map<string, ProviderVm>();

export class MockHypervisorProvider implements HypervisorProvider {
  readonly providerId = "mock" as const;

  async createVm(input: CreateProviderVmInput, _context?: ProviderHostContext): Promise<ProviderVm> {
    const externalId = `mock-${randomUUID()}`;
    const vm: ProviderVm = {
      externalId,
      name: input.name,
      state: "STOPPED",
      ipAddress: undefined
    };
    vmStore.set(externalId, vm);
    return vm;
  }

  async startVm(externalId: string, _context?: ProviderHostContext): Promise<ProviderVm> {
    const vm = this.requireVm(externalId);
    vm.state = "RUNNING";
    vm.ipAddress = vm.ipAddress ?? `10.0.0.${Math.floor(Math.random() * 120) + 10}`;
    vmStore.set(externalId, vm);
    return vm;
  }

  async stopVm(externalId: string, _context?: ProviderHostContext): Promise<ProviderVm> {
    const vm = this.requireVm(externalId);
    vm.state = "STOPPED";
    vmStore.set(externalId, vm);
    return vm;
  }

  async forceStopVm(externalId: string, _context?: ProviderHostContext): Promise<ProviderVm> {
    const vm = this.requireVm(externalId);
    vm.state = "STOPPED";
    vmStore.set(externalId, vm);
    return vm;
  }

  async rebootVm(externalId: string, _context?: ProviderHostContext): Promise<ProviderVm> {
    const vm = this.requireVm(externalId);
    vm.state = "RUNNING";
    vmStore.set(externalId, vm);
    return vm;
  }

  async updateVmResources(externalId: string, _input: UpdateProviderVmInput, _context?: ProviderHostContext): Promise<ProviderVm> {
    const vm = this.requireVm(externalId);
    return vm;
  }

  async updateVmNetwork(externalId: string, _networkName: string | null, _context?: ProviderHostContext): Promise<ProviderVm> {
    const vm = this.requireVm(externalId);
    return vm;
  }

  async attachDisk(externalId: string, input: AttachProviderDiskInput, _context?: ProviderHostContext): Promise<ProviderAttachedDisk> {
    this.requireVm(externalId);
    return {
      volumeName: input.volumeName ?? `mock-extra-${randomUUID().slice(0, 8)}.qcow2`,
      sizeGb: input.sizeGb,
      format: input.format ?? "qcow2",
      targetDev: "vdb",
      path: `/mock/${externalId}/disks`
    };
  }

  async deleteVm(externalId: string, _context?: ProviderHostContext): Promise<void> {
    vmStore.delete(externalId);
  }

  async getVmRuntime(externalId: string, _context?: ProviderHostContext): Promise<ProviderVmRuntime | null> {
    const vm = this.requireVm(externalId);
    return {
      state: vm.state,
      ipAddress: vm.ipAddress
    };
  }

  async getVncTarget(_externalId: string, _context?: ProviderHostContext): Promise<VncTarget | null> {
    return {
      host: env.MOCK_VNC_TARGET_HOST,
      port: env.MOCK_VNC_TARGET_PORT
    };
  }

  private requireVm(externalId: string): ProviderVm {
    const vm = vmStore.get(externalId);
    if (vm) {
      return vm;
    }

    // The DB is persisted but mock provider state is in-memory.
    // Recreate a placeholder VM record after API restarts.
    const recovered: ProviderVm = {
      externalId,
      name: externalId,
      state: "STOPPED"
    };
    vmStore.set(externalId, recovered);
    return recovered;
  }
}
