import { NetworkType, StoragePoolStatus, StoragePoolType } from "@prisma/client";
import { env } from "../../lib/env.js";
import { runCommand } from "../virtual-machines/providers/command-executor.js";

export type DiscoveredStoragePool = {
  name: string;
  type: StoragePoolType;
  status: StoragePoolStatus;
  capacityGb: number;
  usedGb: number;
};

export type DiscoveredNetwork = {
  name: string;
  type: NetworkType;
  cidr: string;
  gatewayIp: string | null;
  vlanId: number | null;
};

export type LibvirtDiscoveryResult = {
  cpuCoresTotal: number;
  memoryMbTotal: number;
  storageGbTotal: number;
  storagePools: DiscoveredStoragePool[];
  networks: DiscoveredNetwork[];
};

export async function discoverLibvirtHost(connectionUri: string): Promise<LibvirtDiscoveryResult> {
  const [nodeInfoOutput, poolNamesOutput, networkNamesOutput] = await Promise.all([
    runVirsh(connectionUri, ["nodeinfo"]),
    runVirsh(connectionUri, ["pool-list", "--all", "--name"]),
    runVirsh(connectionUri, ["net-list", "--all", "--name"])
  ]);

  const parsedNodeInfo = parseColonSeparatedOutput(nodeInfoOutput);
  const cpuCoresTotal = parseInteger(parsedNodeInfo["CPU(s)"]) ?? 1;
  const memoryMbTotal = Math.max(1024, Math.floor((parseKiB(parsedNodeInfo["Memory size"]) ?? 0) / 1024));

  const poolNames = parseNameList(poolNamesOutput);
  const networkNames = parseNameList(networkNamesOutput);

  const storagePools = await Promise.all(
    poolNames.map(async (poolName) => {
      const [poolInfoOutput, poolXmlOutput] = await Promise.all([
        runVirsh(connectionUri, ["pool-info", poolName]),
        runVirsh(connectionUri, ["pool-dumpxml", poolName]).catch(() => "")
      ]);

      const parsedPoolInfo = parseColonSeparatedOutput(poolInfoOutput);
      const rawState = (parsedPoolInfo.State ?? "").toLowerCase();
      const status = mapPoolStatus(rawState);
      const capacityGb = Math.max(1, Math.round(parseToGiB(parsedPoolInfo.Capacity) ?? 1));
      const usedGb = Math.max(0, Math.round(parseToGiB(parsedPoolInfo.Allocation) ?? 0));
      const type = mapPoolType(poolXmlOutput);

      return {
        name: poolName,
        type,
        status,
        capacityGb,
        usedGb: Math.min(usedGb, capacityGb)
      };
    })
  );

  const networks = await Promise.all(
    networkNames.map(async (networkName, index) => {
      const networkXml = await runVirsh(connectionUri, ["net-dumpxml", networkName]).catch(() => "");
      const parsedNetwork = parseNetworkFromXml(networkXml, index);

      return {
        name: networkName,
        type: parsedNetwork.type,
        cidr: parsedNetwork.cidr,
        gatewayIp: parsedNetwork.gatewayIp,
        vlanId: parsedNetwork.vlanId
      };
    })
  );

  const discoveredStorageGbTotal = storagePools.reduce((sum, pool) => sum + pool.capacityGb, 0);

  return {
    cpuCoresTotal,
    memoryMbTotal,
    storageGbTotal: Math.max(1, discoveredStorageGbTotal),
    storagePools,
    networks
  };
}

async function runVirsh(connectionUri: string, args: string[]): Promise<string> {
  return runCommand("virsh", ["-c", connectionUri, ...args], {
    timeoutMs: env.LIBVIRT_COMMAND_TIMEOUT_MS
  });
}

function parseNameList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseColonSeparatedOutput(output: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.includes(":")) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      parsed[key] = value;
    }
  }
  return parsed;
}

function parseInteger(value?: string): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[^\d.-]/g, "");
  const parsed = Number.parseInt(cleaned, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

function parseKiB(value?: string): number | null {
  if (!value) {
    return null;
  }
  const match = value.match(/([\d.]+)\s*ki?b/i);
  if (match) {
    return Number.parseFloat(match[1]);
  }
  const plain = Number.parseFloat(value);
  return Number.isNaN(plain) ? null : plain;
}

function parseToGiB(value?: string): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/([\d.]+)\s*([kmgtpe]?i?b)/i);
  if (!match) {
    const plain = Number.parseFloat(value);
    return Number.isNaN(plain) ? null : plain;
  }

  const amount = Number.parseFloat(match[1]);
  if (Number.isNaN(amount)) {
    return null;
  }

  const unit = match[2].toLowerCase();
  const bytes = toBytes(amount, unit);
  return bytes / 1024 ** 3;
}

function toBytes(value: number, unit: string): number {
  switch (unit) {
    case "b":
      return value;
    case "kb":
      return value * 1000;
    case "kib":
      return value * 1024;
    case "mb":
      return value * 1000 ** 2;
    case "mib":
      return value * 1024 ** 2;
    case "gb":
      return value * 1000 ** 3;
    case "gib":
      return value * 1024 ** 3;
    case "tb":
      return value * 1000 ** 4;
    case "tib":
      return value * 1024 ** 4;
    case "pb":
      return value * 1000 ** 5;
    case "pib":
      return value * 1024 ** 5;
    case "eb":
      return value * 1000 ** 6;
    case "eib":
      return value * 1024 ** 6;
    default:
      return value;
  }
}

function mapPoolStatus(rawState: string): StoragePoolStatus {
  const state = rawState.trim().toLowerCase();
  if (state.includes("degrad")) {
    return "DEGRADED";
  }
  if (state === "running" || state === "active") {
    return "READY";
  }
  return "OFFLINE";
}

function mapPoolType(xml: string): StoragePoolType {
  const rawType = xml.match(/<pool[^>]*type=['"]([^'"]+)['"]/i)?.[1]?.toLowerCase() ?? "dir";
  if (rawType === "dir" || rawType === "fs") {
    return "DIR";
  }
  if (rawType === "netfs") {
    return "NFS";
  }
  if (rawType === "logical") {
    return "LVM";
  }
  if (rawType === "zfs") {
    return "ZFS";
  }
  return "DIR";
}

function parseNetworkFromXml(xml: string, fallbackIndex: number): {
  type: NetworkType;
  cidr: string;
  gatewayIp: string | null;
  vlanId: number | null;
} {
  const forwardMode = xml.match(/<forward[^>]*mode=['"]([^'"]+)['"]/i)?.[1]?.toLowerCase();
  const vlanMatch = xml.match(/<vlan>[\s\S]*?<tag[^>]*id=['"](\d{1,4})['"]/i);
  const vlanId = vlanMatch ? Number.parseInt(vlanMatch[1], 10) : null;

  const ipConfig = extractIpv4Config(xml);

  const type: NetworkType = vlanId
    ? "VLAN"
    : forwardMode === "nat"
      ? "NAT"
      : forwardMode === "bridge" || forwardMode === "route" || forwardMode === "open"
        ? "BRIDGE"
        : "INTERNAL";

  if (ipConfig) {
    return {
      type,
      cidr: ipConfig.cidr,
      gatewayIp: ipConfig.gatewayIp,
      vlanId
    };
  }

  const fallbackSegment = (fallbackIndex % 200) + 20;
  if (type === "NAT") {
    return {
      type,
      cidr: `10.80.${fallbackSegment}.0/24`,
      gatewayIp: `10.80.${fallbackSegment}.1`,
      vlanId
    };
  }

  if (type === "INTERNAL") {
    return {
      type,
      cidr: `10.90.${fallbackSegment}.0/24`,
      gatewayIp: `10.90.${fallbackSegment}.1`,
      vlanId
    };
  }

  return {
    type,
    cidr: "0.0.0.0/0",
    gatewayIp: null,
    vlanId
  };
}

function extractIpv4Config(xml: string): { cidr: string; gatewayIp: string } | null {
  const ipTagRegex = /<ip\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = ipTagRegex.exec(xml))) {
    const attrs = parseXmlAttributes(match[1]);
    const family = (attrs.family ?? "").toLowerCase();
    if (family === "ipv6") {
      continue;
    }

    const address = attrs.address;
    if (!address || !isIpv4(address)) {
      continue;
    }

    const prefix =
      attrs.prefix && Number.parseInt(attrs.prefix, 10) >= 0 && Number.parseInt(attrs.prefix, 10) <= 32
        ? Number.parseInt(attrs.prefix, 10)
        : attrs.netmask
          ? netmaskToPrefix(attrs.netmask)
          : null;

    if (prefix === null) {
      continue;
    }

    const networkAddress = toNetworkAddress(address, prefix);
    if (!networkAddress) {
      continue;
    }

    return {
      cidr: `${networkAddress}/${prefix}`,
      gatewayIp: address
    };
  }

  return null;
}

function parseXmlAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)=['"]([^'"]*)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(input))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    const number = Number.parseInt(part, 10);
    return !Number.isNaN(number) && number >= 0 && number <= 255;
  });
}

function netmaskToPrefix(mask: string): number | null {
  if (!isIpv4(mask)) {
    return null;
  }
  const binary = mask
    .split(".")
    .map((octet) => Number.parseInt(octet, 10).toString(2).padStart(8, "0"))
    .join("");

  if (!/^1*0*$/.test(binary)) {
    return null;
  }
  return binary.indexOf("0") === -1 ? 32 : binary.indexOf("0");
}

function toNetworkAddress(ip: string, prefix: number): string | null {
  if (!isIpv4(ip) || prefix < 0 || prefix > 32) {
    return null;
  }

  const ipInteger = ip
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;

  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const network = ipInteger & mask;

  return [
    (network >>> 24) & 255,
    (network >>> 16) & 255,
    (network >>> 8) & 255,
    network & 255
  ].join(".");
}
