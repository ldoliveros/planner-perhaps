"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { PlannerLogo } from "@/components/branding/planner-logo";
import { getAdminNavItems } from "@/components/admin/admin-nav-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMenu } from "@/components/shared/user-menu";
import { ROLE_LABELS } from "@/lib/role-labels";
import { APP_VERSION } from "@/lib/version";
import { cn } from "cn";

// Cookie histórica: "1" = compacto (sin fijar, se expande por hover), "0"/ausente = fijado abierto.
const COLLAPSE_COOKIE = "sidebar_collapsed";
const WIDTH_COMPACT = "w-[68px]";
const WIDTH_EXPANDED = "w-[232px]";

interface AdminSidebarProps {
  role: "super_admin" | "account_manager";
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  defaultCollapsed: boolean;
}

export function AdminSidebar({ role, email, fullName, avatarUrl, defaultCollapsed }: AdminSidebarProps) {
  // pinned = abierto permanentemente; sin fijar = compacto que se expande temporalmente por hover.
  const [pinned, setPinned] = useState(!defaultCollapsed);
  const [hovered, setHovered] = useState(false);
  const pathname = usePathname();
  const items = getAdminNavItems(role);

  // Estado visual: compacto salvo que esté fijado o el mouse esté encima.
  const expanded = pinned || hovered;
  const collapsed = !expanded;
  const overlay = expanded && !pinned;

  function togglePinned() {
    const next = !pinned;
    setPinned(next);
    document.cookie = `${COLLAPSE_COOKIE}=${next ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    // El contenedor reserva el ancho del layout (fijado: 232px, sin fijar: 68px) y detecta el hover; el aside
    // vive dentro de él, así no hay hueco entre ambos que dispare enter/leave. La expansión por hover es
    // un overlay (absolute): nunca desplaza ni redimensiona el contenido principal.
    <div
      className={cn(
        "relative hidden h-dvh shrink-0 transition-[width] duration-150 ease-out md:block",
        pinned ? WIDTH_EXPANDED : WIDTH_COMPACT
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
    <aside
      className={cn(
        "absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden bg-[#111318] transition-[width,box-shadow] duration-150 ease-out",
        expanded ? WIDTH_EXPANDED : WIDTH_COMPACT,
        overlay && "shadow-2xl shadow-black/40"
      )}
    >
      <div className={cn("flex items-center gap-2 px-4 pt-5 pb-4", collapsed && "justify-center px-0 pb-3")}>
        <Link
          href="/admin"
          aria-label="Planner by Perhaps"
          className={cn("flex min-w-0 items-center text-white", !collapsed && "flex-1")}
        >
          {/* Abierta: logo negativo completo. Cerrada: isotipo (favicon). */}
          {collapsed ? (
            <PlannerLogo variant="icon" height={32} className="rounded-md" />
          ) : (
            <PlannerLogo variant="negative" height={28} />
          )}
        </Link>
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={togglePinned}
                  aria-label={pinned ? "Colapsar navegación" : "Fijar navegación abierta"}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                />
              }
            >
              {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </TooltipTrigger>
            <TooltipContent side="bottom">{pinned ? "Colapsar" : "Fijar abierto"}</TooltipContent>
          </Tooltip>
        )}
      </div>

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
          {collapsed ? `v${APP_VERSION}` : `Planner by Perhaps · v${APP_VERSION}`}
        </Link>
      </div>
    </aside>
    </div>
  );
}
