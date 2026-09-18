"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { PerhapsIsologo } from "@/components/branding/perhaps-isologo";
import { getAdminNavItems } from "@/components/admin/admin-nav-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMenu } from "@/components/shared/user-menu";
import { ROLE_LABELS } from "@/lib/role-labels";
import { APP_VERSION } from "@/lib/version";
import { cn } from "cn";

const COLLAPSE_COOKIE = "sidebar_collapsed";

interface AdminSidebarProps {
  role: "super_admin" | "account_manager";
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  defaultCollapsed: boolean;
}

export function AdminSidebar({ role, email, fullName, avatarUrl, defaultCollapsed }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();
  const items = getAdminNavItems(role);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col bg-[#111318] transition-[width] duration-200 ease-in-out md:flex",
        collapsed ? "w-[68px]" : "w-[232px]"
      )}
    >
      <div className={cn("flex items-center gap-2 px-4 pt-5 pb-3", collapsed && "justify-center px-0")}>
        <Link href="/admin" className={cn("flex min-w-0 items-center gap-2 text-white", !collapsed && "flex-1")}>
          <PerhapsIsologo size={22} />
          {!collapsed && <span className="truncate text-base font-bold tracking-tight">Perhaps.</span>}
        </Link>
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label="Colapsar navegación"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                />
              }
            >
              <PanelLeftClose className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom">Colapsar</TooltipContent>
          </Tooltip>
        )}
      </div>

      {!collapsed ? (
        <div className="px-4 pb-4 text-[10px] font-semibold tracking-[0.18em] text-white/40 uppercase">
          Planificador Editorial
        </div>
      ) : (
        <div className="flex justify-center pb-4">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label="Expandir navegación"
                  className="flex size-8 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                />
              }
            >
              <PanelLeftOpen className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Expandir</TooltipContent>
          </Tooltip>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          const link = (
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0 py-2.5",
                active ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/90"
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );

          if (!collapsed) {
            return <div key={item.href}>{link}</div>;
          }

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger render={link} />
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-2.5">
        <UserMenu
          email={email}
          fullName={fullName}
          avatarUrl={avatarUrl}
          profileHref="/admin/profile"
          signOutRedirectTo="/login"
          roleLabel={ROLE_LABELS[role]}
          variant="sidebar"
          collapsed={collapsed}
        />
        <Link
          href="/changelog"
          className={cn(
            "mt-1.5 block truncate rounded-md px-2 py-1 text-center text-[10px] text-white/25 transition-colors hover:text-white/60",
            collapsed && "px-0"
          )}
        >
          {collapsed ? `v${APP_VERSION}` : `Perhaps Planner · v${APP_VERSION}`}
        </Link>
      </div>
    </aside>
  );
}
