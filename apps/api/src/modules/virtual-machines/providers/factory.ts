import { env } from "../../../lib/env.js";
import { LibvirtHypervisorProvider } from "./libvirt.provider.js";
import { MockHypervisorProvider } from "./mock.provider.js";
import type { HypervisorProvider } from "./types.js";

let providerInstance: HypervisorProvider | null = null;

export function getHypervisorProvider(): HypervisorProvider {
  if (providerInstance) {
    return providerInstance;
  }

  providerInstance = env.HYPERVISOR_PROVIDER === "libvirt" ? new LibvirtHypervisorProvider() : new MockHypervisorProvider();
  return providerInstance;
}

