"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { NotificationsPanel } from "@/components/notifications/notifications-history";
import { cn } from "cn";

function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

interface NotificationBellProps {
  /** sidebar: fila oscura del sidebar de admin (respeta `collapsed`) · header: ícono en barras claras. */
  variant: "sidebar" | "header";
  collapsed?: boolean;
  /** Solo variant="header": escala compacta del encabezado del Planner (28 px; 44 en táctil). */
  compact?: boolean;
}

/**
 * Campanita global (v1.6). Abre la bandeja en un drawer lateral (derecha; pantalla completa en mobile) sin salir
 * de la pantalla actual, así el calendario conserva su estado. No tiene estado propio de datos ni suscripción:
 * lee el NotificationsProvider del layout, así la de desktop y la de mobile comparten la misma bandeja y el mismo
 * canal Realtime. La página de historial sigue existiendo para accesos directos.
 */
export function NotificationBell({ variant, collapsed = false, compact = false }: NotificationBellProps) {
  const { unreadCount, loadState } = useNotifications();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const label = unreadCount > 0 ? `Notificaciones: ${unreadCount} sin leer` : "Notificaciones";
  const showBadge = loadState === "ready" && unreadCount > 0;

  const trigger =
    variant === "sidebar" ? (
      <button
        type="button"
        aria-label={label}
        className={cn(
          "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white/90",
          collapsed && "justify-center px-0 py-2.5",
          drawerOpen && "bg-white/10 text-white"
        )}
      />
    ) : (
      <button
        type="button"
        aria-label={label}
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-11",
          compact && "size-7"
        )}
      />
    );

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetTrigger render={trigger}>
        {/* El ícono (sin espacio extra de línea) queda centrado en el área clicable; el contador es absoluto. */}
        <span className="relative flex shrink-0 items-center justify-center leading-none">
          <Bell className={cn("block", compact ? "size-4" : "size-[18px]")} />
          {showBadge && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3459] px-1 text-[10px] leading-none font-semibold text-white"
            >
              {badgeText(unreadCount)}
            </span>
          )}
        </span>
        {variant === "sidebar" && !collapsed && <span className="truncate">Notificaciones</span>}
      </SheetTrigger>
      <SheetContent
        side="right"
        mobile="fullscreen"
        className="gap-0 data-[side=right]:w-[420px] data-[side=right]:sm:max-w-[420px]"
      >
        <NotificationsPanel
          variant="drawer"
          heading={<SheetTitle className="text-base font-semibold">Notificaciones</SheetTitle>}
          onBeforeOpen={() => setDrawerOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
