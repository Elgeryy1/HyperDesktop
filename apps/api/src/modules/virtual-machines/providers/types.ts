export type ProviderVmState =
  | "PROVISIONING"
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "REBOOTING"
  | "ERROR"
  | "DELETING"
  | "DELETED";

export type ProviderVm = {
  externalId: string;
  name: string;
  state: ProviderVmState;
  ipAddress?: string;
};

export type ProviderVmRuntime = {
  state: ProviderVmState;
  ipAddress?: string;
};

export type CreateProviderVmInput = {
  name: string;
  vcpu: number;
  memoryMb: number;
  diskGb: number;
  osType?: string;
  isoPath?: string;
  templateRef?: string;
  networkName?: string;
  storagePoolName?: string;
};

export type UpdateProviderVmInput = {
  vcpu?: number;
  memoryMb?: number;
  diskGb?: number;
};

export type AttachProviderDiskInput = {
  sizeGb: number;
  format?: "qcow2" | "raw";
  storagePoolName?: string;
  volumeName?: string;
};

export type ProviderAttachedDisk = {
  volumeName: string;
  sizeGb: number;
  format: string;
  targetDev: string;
  path: string;
};

export type ProviderHostContext = {
  hostName?: string;
  connectionUri?: string;
};

export type VncTarget = {
  host: string;
  port: number;
};

export interface HypervisorProvider {
  readonly providerId: "mock" | "libvirt";
  createVm(input: CreateProviderVmInput, context?: ProviderHostContext): Promise<ProviderVm>;
  startVm(externalId: string, context?: ProviderHostContext): Promise<ProviderVm>;
  stopVm(externalId: string, context?: ProviderHostContext): Promise<ProviderVm>;
  forceStopVm?(externalId: string, context?: ProviderHostContext): Promise<ProviderVm>;
  rebootVm(externalId: string, context?: ProviderHostContext): Promise<ProviderVm>;
  updateVmResources?(externalId: string, input: UpdateProviderVmInput, context?: ProviderHostContext): Promise<ProviderVm>;
  updateVmNetwork?(externalId: string, networkName: string | null, context?: ProviderHostContext): Promise<ProviderVm>;
  attachDisk?(externalId: string, input: AttachProviderDiskInput, context?: ProviderHostContext): Promise<ProviderAttachedDisk>;
  deleteVm(externalId: string, context?: ProviderHostContext): Promise<void>;
  getVmRuntime?(externalId: string, context?: ProviderHostContext): Promise<ProviderVmRuntime | null>;
  getVncTarget?(externalId: string, context?: ProviderHostContext): Promise<VncTarget | null>;
}
