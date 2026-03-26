import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "../../../lib/env.js";
import { runCommand } from "./command-executor.js";
import type {
  AttachProviderDiskInput,
  ProviderAttachedDisk,
  CreateProviderVmInput,
  HypervisorProvider,
  ProviderHostContext,
  ProviderVm,
  UpdateProviderVmInput,
  ProviderVmRuntime,
  ProviderVmState,
  VncTarget
} from "./types.js";

export class LibvirtHypervisorProvider implements HypervisorProvider {
  readonly providerId = "libvirt" as const;

  async createVm(input: CreateProviderVmInput, context?: ProviderHostContext): Promise<ProviderVm> {
    const connectionUri = this.resolveConnectionUri(context);
    const domainName = this.buildDomainName(input.name);
    const storagePoolName = input.storagePoolName ?? env.LIBVIRT_STORAGE_POOL;
    const diskVolumeName = `${domainName}.qcow2`;
    const isoVolumeName = `${domainName}-boot.iso`;

    let diskCreated = false;
    let isoCreated = false;
    try {
      await this.runVirsh(connectionUri, ["pool-info", storagePoolName]);
      await this.runVirsh(connectionUri, ["vol-create-as", "--pool", storagePoolName, diskVolumeName, `${input.diskGb}G`, "--format", "qcow2"]);
      diskCreated = true;

      const diskPath = await this.runVirsh(connectionUri, ["vol-path", "--pool", storagePoolName, diskVolumeName]);
      const bootIsoPath = input.isoPath ? await this.ensureIsoVolume(connectionUri, storagePoolName, isoVolumeName, input.isoPath) : undefined;
      isoCreated = Boolean(bootIsoPath);

      const xml = this.buildDomainXml({
        domainName,
        memoryMb: input.memoryMb,
        vcpu: input.vcpu,
        diskPath,
        isoPath: bootIsoPath,
        networkName: input.networkName ?? env.LIBVIRT_DEFAULT_NETWORK,
        diskBus: env.LIBVIRT_DISK_BUS,
        nicModel: env.LIBVIRT_NIC_MODEL,
        vncListenAddress: env.LIBVIRT_VNC_LISTEN_ADDRESS,
        videoModel: this.resolveVideoModel(input.osType),
        soundModel: env.LIBVIRT_SOUND_MODEL
      });

      const tempDir = mkdtempSync(path.join(tmpdir(), "hyperdesk-libvirt-"));
      const xmlPath = path.join(tempDir, `${domainName}.xml`);
      try {
        writeFileSync(xmlPath, xml, { encoding: "utf8" });
        await this.runVirsh(connectionUri, ["define", xmlPath]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }

      return {
        externalId: domainName,
        name: input.name,
        state: "STOPPED"
      };
    } catch (error) {
      if (diskCreated) {
        await this.runVirsh(connectionUri, ["vol-delete", "--pool", storagePoolName, diskVolumeName]).catch(() => {
          // Ignore cleanup failure.
        });
      }
      if (isoCreated) {
        await this.runVirsh(connectionUri, ["vol-delete", "--pool", storagePoolName, isoVolumeName]).catch(() => {
          // Ignore cleanup failure.
        });
      }
      throw this.wrapError("createVm", error);
    }
  }

  async startVm(externalId: string, context?: ProviderHostContext): Promise<ProviderVm> {
    const connectionUri = this.resolveConnectionUri(context);
    try {
      await this.runVirsh(connectionUri, ["start", externalId]).catch(async (error) => {
        const state = await this.safeGetDomainState(connectionUri, externalId);
        if (state !== "RUNNING") {
          throw error;
        }
      });

      const ipAddress = await this.safeGetVmIp(connectionUri, externalId);
      return {
        externalId,
        name: externalId,
        state: "RUNNING",
        ipAddress
      };
    } catch (error) {
      throw this.wrapError("startVm", error);
    }
  }

  async stopVm(externalId: string, context?: ProviderHostContext): Promise<ProviderVm> {
    const connectionUri = this.resolveConnectionUri(context);
    try {
      const currentState = await this.safeGetDomainState(connectionUri, externalId);
      if (currentState === null) {
        // Domain missing in libvirt: treat as already stopped to avoid blocking stale DB entries.
        return {
          externalId,
          name: externalId,
          state: "STOPPED"
        };
      }
      if (currentState !== "STOPPED") {
        await this.runVirsh(connectionUri, ["shutdown", externalId]).catch(() => {
          // Fallback below if graceful shutdown fails.
        });

        const stoppedGracefully = await this.waitForState(connectionUri, externalId, "STOPPED", 30000);
        if (!stoppedGracefully) {
          await this.runVirsh(connectionUri, ["destroy", externalId]);
        }
      }

      return {
        externalId,
        name: externalId,
        state: "STOPPED"
      };
    } catch (error) {
      if (this.isDomainNotFoundError(error)) {
        return {
          externalId,
          name: externalId,
          state: "STOPPED"
        };
      }
      throw this.wrapError("stopVm", error);
    }
  }

  async forceStopVm(externalId: string, context?: ProviderHostContext): Promise<ProviderVm> {
    const connectionUri = this.resolveConnectionUri(context);
    try {
      const currentState = await this.safeGetDomainState(connectionUri, externalId);
      if (currentState === null || currentState === "STOPPED") {
        return {
          externalId,
          name: externalId,
          state: "STOPPED"
        };
      }

      await this.runVirsh(connectionUri, ["destroy", externalId]);
      return {
        externalId,
        name: externalId,
        state: "STOPPED"
      };
    } catch (error) {
      if (this.isDomainNotFoundError(error)) {
        return {
          externalId,
          name: externalId,
          state: "STOPPED"
        };
      }
      throw this.wrapError("forceStopVm", error);
    }
  }

  async rebootVm(externalId: string, context?: ProviderHostContext): Promise<ProviderVm> {
    const connectionUri = this.resolveConnectionUri(context);
    try {
      await this.runVirsh(connectionUri, ["reboot", externalId]).catch(async () => {
        await this.runVirsh(connectionUri, ["destroy", externalId]);
        await this.runVirsh(connectionUri, ["start", externalId]);
      });

      const ipAddress = await this.safeGetVmIp(connectionUri, externalId);
      return {
        externalId,
        name: externalId,
        state: "RUNNING",
        ipAddress
      };
    } catch (error) {
      throw this.wrapError("rebootVm", error);
    }
  }

  async updateVmResources(externalId: string, input: UpdateProviderVmInput, context?: ProviderHostContext): Promise<ProviderVm> {
    const connectionUri = this.resolveConnectionUri(context);

    try {
      const currentState = await this.safeGetDomainState(connectionUri, externalId);
      if (!currentState) {
        throw new Error(`Domain not found: ${externalId}`);
      }

      if (input.vcpu) {
        await this.applyVcpuChange(connectionUri, externalId, input.vcpu, currentState);
      }
      if (input.memoryMb) {
        await this.applyMemoryChange(connectionUri, externalId, input.memoryMb, currentState);
      }
      if (input.diskGb) {
        await this.resizeBootDisk(connectionUri, externalId, input.diskGb, currentState);
      }

      const nextState = await this.safeGetDomainState(connectionUri, externalId);
      const resolvedState = nextState ?? currentState;
      return {
        externalId,
        name: externalId,
        state: resolvedState,
        ipAddress: resolvedState === "RUNNING" ? await this.safeGetVmIp(connectionUri, externalId) : undefined
      };
    } catch (error) {
      throw this.wrapError("updateVmResources", error);
    }
  }

  async updateVmNetwork(externalId: string, networkName: string | null, context?: ProviderHostContext): Promise<ProviderVm> {
    const connectionUri = this.resolveConnectionUri(context);

    try {
      const currentState = await this.safeGetDomainState(connectionUri, externalId);
      if (!currentState) {
        throw new Error(`Domain not found: ${externalId}`);
      }

      if (networkName) {
        await this.runVirsh(connectionUri, ["net-info", networkName]);
      }

      const currentInterfaces = await this.getDomainNetworkInterfaces(connectionUri, externalId);
      const primaryInterface = currentInterfaces[0];
      const currentNetworkName = primaryInterface?.networkName;
      const mustSwitch = (networkName ?? null) !== (currentNetworkName ?? null);

      if (mustSwitch && primaryInterface) {
        const detachArgs = [
          "detach-interface",
          externalId,
          "--type",
          "network",
          "--mac",
          primaryInterface.macAddress,
          "--config"
        ];
        if (currentState === "RUNNING") {
          detachArgs.push("--live");
        }
        await this.runVirsh(connectionUri, detachArgs);
      }

      if (mustSwitch && networkName) {
        const attachArgs = [
          "attach-interface",
          externalId,
          "--type",
          "network",
          "--source",
          networkName,
          "--model",
          env.LIBVIRT_NIC_MODEL,
          "--config"
        ];
        if (currentState === "RUNNING") {
          attachArgs.push("--live");
        }
        await this.runVirsh(connectionUri, attachArgs);
      }

      const nextState = await this.safeGetDomainState(connectionUri, externalId);
      const resolvedState = nextState ?? currentState;
      return {
        externalId,
        name: externalId,
        state: resolvedState,
        ipAddress: resolvedState === "RUNNING" ? await this.safeGetVmIp(connectionUri, externalId) : undefined
      };
    } catch (error) {
      throw this.wrapError("updateVmNetwork", error);
    }
  }

  async attachDisk(externalId: string, input: AttachProviderDiskInput, context?: ProviderHostContext): Promise<ProviderAttachedDisk> {
    const connectionUri = this.resolveConnectionUri(context);
    const storagePoolName = input.storagePoolName ?? env.LIBVIRT_STORAGE_POOL;
    const format = input.format ?? "qcow2";
    const extension = format === "raw" ? "img" : "qcow2";
    const volumeName = input.volumeName?.trim() || `${externalId}-extra-${randomUUID().slice(0, 8)}.${extension}`;

    let createdVolume = false;
    try {
      await this.runVirsh(connectionUri, ["pool-info", storagePoolName]);
      await this.runVirsh(connectionUri, ["vol-create-as", "--pool", storagePoolName, volumeName, `${input.sizeGb}G`, "--format", format]);
      createdVolume = true;

      const diskPath = await this.runVirsh(connectionUri, ["vol-path", "--pool", storagePoolName, volumeName]);
      const targetDev = await this.getNextDiskTargetDev(connectionUri, externalId);
      await this.runVirsh(connectionUri, [
        "attach-disk",
        externalId,
        diskPath,
        targetDev,
        "--subdriver",
        format,
        "--cache",
        "none",
        "--persistent"
      ]);

      return {
        volumeName,
        sizeGb: input.sizeGb,
        format,
        targetDev,
        path: diskPath
      };
    } catch (error) {
      if (createdVolume) {
        await this.runVirsh(connectionUri, ["vol-delete", "--pool", storagePoolName, volumeName]).catch(() => {
          // Ignore cleanup failures.
        });
      }
      throw this.wrapError("attachDisk", error);
    }
  }

  async getVmRuntime(externalId: string, context?: ProviderHostContext): Promise<ProviderVmRuntime | null> {
    const connectionUri = this.resolveConnectionUri(context);
    const state = await this.safeGetDomainState(connectionUri, externalId);
    if (!state) {
      return null;
    }

    return {
      state,
      ipAddress: state === "RUNNING" ? await this.safeGetVmIp(connectionUri, externalId) : undefined
    };
  }

  async deleteVm(externalId: string, context?: ProviderHostContext): Promise<void> {
    const connectionUri = this.resolveConnectionUri(context);
    try {
      const currentState = await this.safeGetDomainState(connectionUri, externalId);
      if (currentState === null) {
        // Domain already absent.
        return;
      }
      if (currentState === "RUNNING") {
        await this.runVirsh(connectionUri, ["destroy", externalId]).catch(() => {
          // Continue with undefine attempt.
        });
      }

      await this.undefineDomain(connectionUri, externalId);
    } catch (error) {
      if (this.isDomainNotFoundError(error)) {
        return;
      }
      throw this.wrapError("deleteVm", error);
    }
  }

  async getVncTarget(externalId: string, context?: ProviderHostContext): Promise<VncTarget | null> {
    const connectionUri = this.resolveConnectionUri(context);
    try {
      const output = await this.runVirsh(connectionUri, ["vncdisplay", externalId]);
      const parsed = this.parseVncDisplay(output);
      if (!parsed) {
        return null;
      }

      return {
        host: env.LIBVIRT_VNC_HOST_OVERRIDE ?? parsed.host ?? this.resolveVncHostFromUri(connectionUri),
        port: parsed.port
      };
    } catch {
      return null;
    }
  }

  private async runVirsh(connectionUri: string, args: string[]): Promise<string> {
    return runCommand("virsh", ["-c", connectionUri, ...args], {
      timeoutMs: env.LIBVIRT_COMMAND_TIMEOUT_MS
    });
  }

  private async applyVcpuChange(
    connectionUri: string,
    externalId: string,
    vcpu: number,
    state: ProviderVmState
  ): Promise<void> {
    const desired = String(vcpu);
    await this.runVirsh(connectionUri, ["setvcpus", externalId, desired, "--config"]).catch(async () => {
      await this.runVirsh(connectionUri, ["setvcpus", externalId, desired, "--config", "--maximum"]);
    });

    if (state === "RUNNING") {
      await this.runVirsh(connectionUri, ["setvcpus", externalId, desired, "--live"]).catch(() => {
        // Live update is best-effort. Persistent config was already updated.
      });
    }
  }

  private async applyMemoryChange(
    connectionUri: string,
    externalId: string,
    memoryMb: number,
    state: ProviderVmState
  ): Promise<void> {
    const desired = `${memoryMb}M`;
    await this.runVirsh(connectionUri, ["setmaxmem", externalId, desired, "--config"]).catch(() => {
      // Some qemu/libvirt combinations do not allow maxmem updates after define.
    });
    await this.runVirsh(connectionUri, ["setmem", externalId, desired, "--config"]);

    if (state === "RUNNING") {
      await this.runVirsh(connectionUri, ["setmem", externalId, desired, "--live"]).catch(() => {
        // Live update is best-effort. Persistent config was already updated.
      });
    }
  }

  private async resizeBootDisk(
    connectionUri: string,
    externalId: string,
    diskGb: number,
    state: ProviderVmState
  ): Promise<void> {
    const blockDevices = await this.getDomainBlockDevices(connectionUri, externalId);
    const bootDisk = pickBootDisk(blockDevices);
    if (!bootDisk) {
      throw new Error(`Unable to locate a writable disk on domain ${externalId}`);
    }

    await this.tryBlockResize(connectionUri, externalId, bootDisk.target, diskGb, state);
  }

  private async tryBlockResize(
    connectionUri: string,
    externalId: string,
    targetDev: string,
    diskGb: number,
    state: ProviderVmState
  ): Promise<void> {
    const size = `${diskGb}G`;
    const attempts: string[][] = [];

    if (state === "RUNNING") {
      attempts.push(["blockresize", externalId, targetDev, size, "--live"]);
      attempts.push(["blockresize", externalId, targetDev, size, "--current"]);
      attempts.push(["blockresize", externalId, targetDev, size, "--config"]);
      attempts.push(["blockresize", externalId, targetDev, size]);
    } else {
      attempts.push(["blockresize", externalId, targetDev, size, "--config"]);
      attempts.push(["blockresize", externalId, targetDev, size, "--current"]);
      attempts.push(["blockresize", externalId, targetDev, size]);
    }

    let lastError: unknown;
    for (const args of attempts) {
      try {
        await this.runVirsh(connectionUri, args);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Unable to resize disk ${targetDev}`);
  }

  private async getDomainBlockDevices(connectionUri: string, externalId: string): Promise<DomainBlockDevice[]> {
    const output = await this.runVirsh(connectionUri, ["domblklist", externalId, "--details"]);
    return parseDomainBlockDevices(output);
  }

  private async getNextDiskTargetDev(connectionUri: string, externalId: string): Promise<string> {
    const blockDevices = await this.getDomainBlockDevices(connectionUri, externalId);
    const existing = new Set(blockDevices.map((device) => device.target));
    const prefix = env.LIBVIRT_DISK_BUS === "sata" ? "sd" : "vd";

    for (let i = 1; i < 26; i += 1) {
      const candidate = `${prefix}${String.fromCharCode(97 + i)}`;
      if (!existing.has(candidate)) {
        return candidate;
      }
    }

    throw new Error(`No available target device slot on ${externalId}`);
  }

  private async ensureIsoVolume(connectionUri: string, storagePoolName: string, volumeName: string, localIsoPath: string): Promise<string> {
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(localIsoPath).size;
    } catch {
      throw new Error(`ISO file does not exist on API host: ${localIsoPath}`);
    }
    if (sizeBytes <= 0) {
      throw new Error(`ISO file is empty: ${localIsoPath}`);
    }

    await this.runVirsh(connectionUri, ["vol-create-as", "--pool", storagePoolName, volumeName, `${sizeBytes}B`, "--format", "raw"]);
    try {
      await runCommand("virsh", ["-c", connectionUri, "vol-upload", "--pool", storagePoolName, volumeName, localIsoPath], {
        timeoutMs: env.LIBVIRT_ISO_UPLOAD_TIMEOUT_MS
      });
    } catch (error) {
      await this.runVirsh(connectionUri, ["vol-delete", "--pool", storagePoolName, volumeName]).catch(() => {
        // Ignore cleanup failure.
      });
      throw error;
    }

    return this.runVirsh(connectionUri, ["vol-path", "--pool", storagePoolName, volumeName]);
  }

  private resolveConnectionUri(context?: ProviderHostContext): string {
    const requested = context?.connectionUri?.trim();
    if (!requested) {
      return env.LIBVIRT_DEFAULT_URI;
    }

    const isLocalSocketUri = requested === "qemu:///system" || requested === "qemu:///session";
    if (isLocalSocketUri) {
      return env.LIBVIRT_DEFAULT_URI;
    }

    return requested;
  }

  private resolveVideoModel(osType?: string): "vga" | "virtio" | "qxl" {
    const normalized = osType?.toLowerCase() ?? "";
    if (normalized.includes("windows")) {
      return env.LIBVIRT_WINDOWS_VIDEO_MODEL;
    }
    return env.LIBVIRT_VIDEO_MODEL;
  }

  private buildDomainName(displayName: string): string {
    const prefix = sanitizeToken(env.LIBVIRT_VM_NAME_PREFIX, "hd");
    const base = sanitizeToken(displayName, "vm");
    const suffix = randomUUID().slice(0, 8);
    const candidate = `${prefix}-${base}-${suffix}`;
    return candidate.slice(0, 63);
  }

  private buildDomainXml(input: {
    domainName: string;
    memoryMb: number;
    vcpu: number;
    diskPath: string;
    isoPath?: string;
    networkName?: string;
    diskBus: "sata" | "virtio";
    nicModel: "e1000" | "virtio" | "rtl8139";
    vncListenAddress: string;
    videoModel: "vga" | "virtio" | "qxl";
    soundModel: "ich9" | "ich6" | "ac97" | "es1370" | "none";
  }): string {
    const networkXml = input.networkName
      ? `<interface type='network'>
      <source network='${xmlEscape(input.networkName)}'/>
      <model type='${xmlEscape(input.nicModel)}'/>
    </interface>`
      : "";

    const diskTarget = input.diskBus === "sata" ? "sda" : "vda";
    const cdromTarget = input.diskBus === "sata" ? "sdb" : "sda";

    const cdromXml = input.isoPath
      ? `<disk type='file' device='cdrom'>
      <driver name='qemu' type='raw'/>
      <source file='${xmlEscape(input.isoPath)}'/>
      <target dev='${cdromTarget}' bus='sata'/>
      <readonly/>
    </disk>`
      : "";

    const soundXml =
      input.soundModel === "none"
        ? ""
        : `<audio id='1' type='none'/>
    <sound model='${xmlEscape(input.soundModel)}'>
      <audio id='1'/>
    </sound>`;

    return `<domain type='kvm'>
  <name>${xmlEscape(input.domainName)}</name>
  <memory unit='MiB'>${input.memoryMb}</memory>
  <currentMemory unit='MiB'>${input.memoryMb}</currentMemory>
  <vcpu placement='static'>${input.vcpu}</vcpu>
  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <boot dev='${input.isoPath ? "cdrom" : "hd"}'/>
    <boot dev='hd'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <cpu mode='host-model' check='partial'/>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2' cache='none'/>
      <source file='${xmlEscape(input.diskPath)}'/>
      <target dev='${diskTarget}' bus='${input.diskBus}'/>
    </disk>
    ${cdromXml}
    ${networkXml}
    <input type='tablet' bus='usb'/>
    <graphics type='vnc' autoport='yes' listen='${xmlEscape(input.vncListenAddress)}'/>
    ${soundXml}
    <video>
      <model type='${xmlEscape(input.videoModel)}'/>
    </video>
    <serial type='pty'>
      <target port='0'/>
    </serial>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
  </devices>
</domain>`;
  }

  private async safeGetVmIp(connectionUri: string, externalId: string): Promise<string | undefined> {
    const sources = ["agent", "lease", "arp"];
    for (const source of sources) {
      try {
        const output = await this.runVirsh(connectionUri, ["domifaddr", externalId, "--source", source]);
        const ip = parseFirstIpv4(output);
        if (ip) {
          return ip;
        }
      } catch {
        // keep trying other sources
      }
    }
    return this.safeGetVmIpFromDhcpLeases(connectionUri, externalId);
  }

  private async safeGetVmIpFromDhcpLeases(connectionUri: string, externalId: string): Promise<string | undefined> {
    const networkInterfaces = await this.getDomainNetworkInterfaces(connectionUri, externalId);
    for (const iface of networkInterfaces) {
      try {
        const leasesOutput = await this.runVirsh(connectionUri, ["net-dhcp-leases", iface.networkName]);
        const ip = parseLeaseIpv4ForMac(leasesOutput, iface.macAddress);
        if (ip) {
          return ip;
        }
      } catch {
        // try next interface/network
      }
    }

    return undefined;
  }

  private async getDomainNetworkInterfaces(
    connectionUri: string,
    externalId: string
  ): Promise<Array<{ networkName: string; macAddress: string }>> {
    try {
      const output = await this.runVirsh(connectionUri, ["domiflist", externalId]);
      return parseDomainNetworkInterfaces(output);
    } catch {
      return [];
    }
  }

  private async safeGetDomainState(connectionUri: string, externalId: string): Promise<ProviderVmState | null> {
    try {
      const stateOutput = await this.runVirsh(connectionUri, ["domstate", externalId]);
      return mapLibvirtStateToProvider(stateOutput);
    } catch {
      return null;
    }
  }

  private async waitForState(
    connectionUri: string,
    externalId: string,
    desiredState: ProviderVmState,
    timeoutMs: number
  ): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const current = await this.safeGetDomainState(connectionUri, externalId);
      if (current === desiredState) {
        return true;
      }
      await sleep(2000);
    }
    return false;
  }

  private async undefineDomain(connectionUri: string, externalId: string): Promise<void> {
    const variants = [
      ["undefine", externalId, "--nvram", "--managed-save", "--snapshots-metadata", "--remove-all-storage"],
      ["undefine", externalId, "--remove-all-storage"],
      ["undefine", externalId]
    ];

    for (const args of variants) {
      try {
        await this.runVirsh(connectionUri, args);
        return;
      } catch {
        // Try next variant.
      }
    }

    throw new Error(`Unable to undefine domain ${externalId}`);
  }

  private parseVncDisplay(output: string): { host?: string; port: number } | null {
    const cleaned = output.trim().split(/\r?\n/)[0]?.trim();
    if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "none") {
      return null;
    }

    if (cleaned.startsWith(":")) {
      const display = Number.parseInt(cleaned.slice(1), 10);
      if (Number.isNaN(display)) {
        return null;
      }
      return { port: 5900 + display };
    }

    const ipv6Match = cleaned.match(/^\[([^\]]+)\]:(\d+)$/);
    if (ipv6Match) {
      const second = Number.parseInt(ipv6Match[2], 10);
      return {
        host: ipv6Match[1],
        port: second >= 100 ? second : 5900 + second
      };
    }

    const parts = cleaned.split(":");
    if (parts.length >= 2) {
      const host = parts.slice(0, -1).join(":");
      const second = Number.parseInt(parts[parts.length - 1], 10);
      if (!Number.isNaN(second)) {
        return {
          host,
          port: second >= 100 ? second : 5900 + second
        };
      }
    }

    return null;
  }

  private resolveVncHostFromUri(connectionUri: string): string {
    if (env.LIBVIRT_VNC_HOST_OVERRIDE) {
      return env.LIBVIRT_VNC_HOST_OVERRIDE;
    }

    try {
      const parsed = new URL(connectionUri);
      if (parsed.hostname) {
        return parsed.hostname;
      }
    } catch {
      // Keep fallback below.
    }

    return env.LIBVIRT_VNC_HOST_FALLBACK;
  }

  private wrapError(action: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`[libvirt] ${action} failed: ${message}`);
  }

  private isDomainNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    return (
      normalized.includes("failed to get domain") ||
      normalized.includes("domain not found") ||
      normalized.includes("domain is not running")
    );
  }
}

function sanitizeToken(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || fallback;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseFirstIpv4(output: string): string | undefined {
  const match = output.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\/\d+\b/);
  return match?.[1];
}

function parseLeaseIpv4ForMac(output: string, macAddress: string): string | undefined {
  const normalizedMac = macAddress.trim().toLowerCase();
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    if (!line.toLowerCase().includes(normalizedMac)) {
      continue;
    }
    const ip = parseFirstIpv4(line);
    if (ip) {
      return ip;
    }
  }
  return undefined;
}

function parseDomainNetworkInterfaces(output: string): Array<{ networkName: string; macAddress: string }> {
  const interfaces: Array<{ networkName: string; macAddress: string }> = [];
  const lines = output.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.toLowerCase().startsWith("interface") || line.startsWith("-")) {
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 5) {
      continue;
    }

    const type = parts[1];
    const source = parts[2];
    const macAddress = parts[4];

    if (type !== "network" || source === "-" || !macAddress.includes(":")) {
      continue;
    }

    interfaces.push({
      networkName: source,
      macAddress
    });
  }

  return interfaces;
}

type DomainBlockDevice = {
  type: string;
  device: string;
  target: string;
  source: string;
};

function parseDomainBlockDevices(output: string): DomainBlockDevice[] {
  const devices: DomainBlockDevice[] = [];
  const lines = output.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.toLowerCase().startsWith("type") || line.startsWith("-")) {
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 4) {
      continue;
    }

    const [type, device, target, ...sourceParts] = parts;
    const source = sourceParts.join(" ");
    devices.push({
      type,
      device,
      target,
      source
    });
  }

  return devices;
}

function pickBootDisk(devices: DomainBlockDevice[]): DomainBlockDevice | null {
  const diskDevice = devices.find((device) => device.device === "disk" && device.target.startsWith("vd"));
  if (diskDevice) {
    return diskDevice;
  }

  const sataDisk = devices.find((device) => device.device === "disk" && device.target.startsWith("sd"));
  if (sataDisk) {
    return sataDisk;
  }

  return devices.find((device) => device.device === "disk") ?? null;
}

function mapLibvirtStateToProvider(value: string): ProviderVmState {
  const state = value.trim().toLowerCase();

  if (state.includes("running") || state.includes("paused") || state.includes("idle")) {
    return "RUNNING";
  }
  if (state.includes("in shutdown")) {
    return "STOPPING";
  }
  if (state.includes("shut off") || state.includes("shutoff")) {
    return "STOPPED";
  }
  if (state.includes("crashed")) {
    return "ERROR";
  }

  return "ERROR";
}
