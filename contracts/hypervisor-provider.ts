export type VmId = string;
export type SnapshotId = string;
export type CorrelationId = string;

export type PowerState =
  | "provisioning"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "rebooting"
  | "deleting"
  | "error"
  | "unknown";

export interface VmSpec {
  name: string;
  vcpu: number;
  memoryMiB: number;
  diskGiB: number;
  imageRef?: string;
  templateRef?: string;
  networkRefs: string[];
  cloudInit?: string;
  tags?: Record<string, string>;
}

export interface VmSummary {
  id: VmId;
  externalId?: string;
  name: string;
  state: PowerState;
  ipAddresses: string[];
  vcpu: number;
  memoryMiB: number;
  tags: Record<string, string>;
  updatedAt: string;
}

export interface VmMetrics {
  cpuPct?: number;
  memoryUsedMiB?: number;
  netRxBytes?: number;
  netTxBytes?: number;
  diskReadBytes?: number;
  diskWriteBytes?: number;
  collectedAt: string;
}

export interface RequestOpts {
  correlationId?: CorrelationId;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export interface VmPatch {
  vcpu?: number;
  memoryMiB?: number;
  tags?: Record<string, string>;
}

export interface VmFilter {
  state?: PowerState;
  name?: string;
}

export interface Operation<T = unknown> {
  id: string;
  provider: string;
  correlationId?: CorrelationId;
  startedAt: string;
  finishedAt?: string;
  status: "pending" | "running" | "succeeded" | "failed";
  result?: T;
  error?: HypervisorError;
}

export interface ProviderCapabilities {
  snapshots: boolean;
  liveResize: boolean;
  pauseResume: boolean;
  metrics: boolean;
  cloudInit: boolean;
}

export interface ProviderHealth {
  status: "up" | "degraded" | "down";
  latencyMs?: number;
  version?: string;
  details?: Record<string, string>;
}

export type HypervisorErrorCode =
  | "VM_NOT_FOUND"
  | "VM_ALREADY_EXISTS"
  | "INVALID_SPEC"
  | "INVALID_STATE_TRANSITION"
  | "RESOURCE_EXHAUSTED"
  | "PERMISSION_DENIED"
  | "AUTH_FAILED"
  | "PROVIDER_UNAVAILABLE"
  | "OPERATION_TIMEOUT"
  | "NETWORK_ERROR"
  | "UNSUPPORTED_CAPABILITY"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export class HypervisorError extends Error {
  public readonly code: HypervisorErrorCode;
  public readonly retryable: boolean;
  public readonly provider: string;
  public readonly correlationId?: string;
  public readonly causeData?: unknown;

  constructor(input: {
    code: HypervisorErrorCode;
    message: string;
    retryable: boolean;
    provider: string;
    correlationId?: string;
    causeData?: unknown;
  }) {
    super(input.message);
    this.name = "HypervisorError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.provider = input.provider;
    this.correlationId = input.correlationId;
    this.causeData = input.causeData;
  }
}

export interface HypervisorProvider {
  readonly providerId: string;
  readonly capabilities: ProviderCapabilities;

  createVm(spec: VmSpec, opts?: RequestOpts): Promise<Operation<VmSummary>>;
  getVm(id: VmId, opts?: RequestOpts): Promise<VmSummary>;
  listVms(filter?: VmFilter, opts?: RequestOpts): Promise<VmSummary[]>;
  updateVm(id: VmId, patch: VmPatch, opts?: RequestOpts): Promise<Operation<VmSummary>>;
  deleteVm(id: VmId, opts?: RequestOpts): Promise<Operation<void>>;

  startVm(id: VmId, opts?: RequestOpts): Promise<Operation<void>>;
  stopVm(id: VmId, mode?: "graceful" | "force", opts?: RequestOpts): Promise<Operation<void>>;
  restartVm(id: VmId, opts?: RequestOpts): Promise<Operation<void>>;

  createSnapshot(vmId: VmId, name: string, opts?: RequestOpts): Promise<Operation<SnapshotId>>;
  revertSnapshot(vmId: VmId, snapshotId: SnapshotId, opts?: RequestOpts): Promise<Operation<void>>;
  deleteSnapshot(vmId: VmId, snapshotId: SnapshotId, opts?: RequestOpts): Promise<Operation<void>>;

  getMetrics(vmId: VmId, opts?: RequestOpts): Promise<VmMetrics>;
  healthCheck(opts?: RequestOpts): Promise<ProviderHealth>;
}

