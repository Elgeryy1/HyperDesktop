"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Monitor,
  Network,
  Disc,
  Users,
  Server,
  Layers,
  FileText,
  Zap,
  ChevronRight
} from "lucide-react";

const navSections = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }
    ]
  },
  {
    title: "Compute",
    items: [
      { href: "/virtual-machines", label: "Virtual Machines", icon: Monitor },
      { href: "/templates", label: "Templates", icon: Layers },
      { href: "/hypervisors", label: "Hypervisors", icon: Server }
    ]
  },
  {
    title: "Infrastructure",
    items: [
      { href: "/networks", label: "Networks", icon: Network },
      { href: "/isos", label: "ISO Library", icon: Disc }
    ]
  },
  {
    title: "Administration",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/audit-logs", label: "Audit Logs", icon: FileText }
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-scrollbar flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#08080c] text-neutral-400">
      {/* Logo */}
      <div className="px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <Zap className="h-4.5 w-4.5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold tracking-tight text-white">HyperDesk</h1>
            <p className="text-[10px] font-medium text-neutral-500">v0.1.0-alpha</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pb-4 space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-600">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                      isActive
                        ? "bg-indigo-500/10 text-white"
                        : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-indigo-500" />
                    )}
                    <Icon
                      className={clsx(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive ? "text-indigo-400" : "text-neutral-500 group-hover:text-neutral-400"
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <ChevronRight className="h-3.5 w-3.5 text-indigo-400/60" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Status footer */}
      <div className="mx-3 mb-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="relative">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <div className="absolute inset-0 h-2 w-2 rounded-full bg-emerald-500 animate-pulse-soft" />
          </div>
          <span className="text-xs font-medium text-neutral-300">System Online</span>
        </div>
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          Virtualization engine active
        </p>
      </div>
    </aside>
  );
}
