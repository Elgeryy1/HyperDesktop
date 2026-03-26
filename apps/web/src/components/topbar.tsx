"use client";

import { useRouter, usePathname } from "next/navigation";
import { apiRequest, clearSession } from "../lib/api";
import { LogOut, ChevronRight } from "lucide-react";
import { useMemo } from "react";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/virtual-machines": "Virtual Machines",
  "/virtual-machines/new": "Create Instance",
  "/hypervisors": "Hypervisors",
  "/networks": "Networks",
  "/isos": "ISO Library",
  "/users": "Users",
  "/audit-logs": "Audit Logs"
};

export function Topbar() {
  const router = useRouter();
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];

    for (let i = 0; i < segments.length; i++) {
      const href = "/" + segments.slice(0, i + 1).join("/");
      const label = routeLabels[href] ?? segments[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      crumbs.push({ label, href });
    }

    return crumbs;
  }, [pathname]);

  const logout = async () => {
    const refreshToken = localStorage.getItem("hyperdesk_refresh_token");
    if (refreshToken) {
      try {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: { refreshToken }
        });
      } catch {
        // Local cleanup still runs
      }
    }

    clearSession();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/[0.06] bg-[#08080c]/80 px-6 py-3 backdrop-blur-xl">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-neutral-500 font-medium">Console</span>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-neutral-600" />
            <span className={i === breadcrumbs.length - 1 ? "text-white font-medium" : "text-neutral-500"}>
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Actions */}
      <button
        className="group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-neutral-400 transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
        type="button"
        onClick={logout}
      >
        <LogOut className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span>Sign Out</span>
      </button>
    </header>
  );
}
