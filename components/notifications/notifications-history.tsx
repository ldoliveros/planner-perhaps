"use client";

import type { ReactNode } from "react";
import { CheckCheck, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { NotificationItem } from "@/components/notifications/notification-item";
import { ADMIN_ACTIONS_RESERVE_SHARED } from "@/lib/admin-shell";
import { cn } from "cn";

interface NotificationsPanelProps {
  /** page: historial en /admin|/client/notifications · drawer: panel lateral de la campanita. */
  variant: "page" | "drawer";
  /** Título accesible del contenedor (h1 en la página, SheetTitle en el drawer). */
  heading: ReactNode;
  /** Se llama antes de abrir una notificación (el drawer se cierra para no tapar la publicación). */
  onBeforeOpen?: () => void;
}

/**
 * Bandeja de pendientes (v1.6): solo notificaciones no leídas (el provider ya carga solo esas), contador, marcar una
 * / todas, paginado y estados vacío/error. Abrir o marcar una la quita al instante. La comparten la página de
 * notificaciones y el drawer de la campanita; los datos vienen del NotificationsProvider.
 */
export function NotificationsPanel({ variant, heading, onBeforeOpen }: NotificationsPanelProps) {
  const { items, unreadCount, loadState, loadError, hasMore, loadingMore, loadMore, markRead, markAllRead, open, resync, liveState } =
    useNotifications();
  const visible = items.filter((n) => !n.readAt);
  const drawer = variant === "drawer";

  const list = (
    <>
      {loadState === "loading" && (
        <p className="flex items-center gap-1.5 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando notificaciones...
        </p>
      )}
      {loadState === "unavailable" && (
        <p className="px-4 py-8 text-sm text-muted-foreground">Las notificaciones todavía no están disponibles. {loadError}</p>
      )}
      {loadState === "error" && (
        <div className="flex items-center justify-between gap-2 px-4 py-6 text-sm text-destructive">
          <span>No se pudieron cargar las notificaciones. {loadError}</span>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void resync()}>
            <RefreshCcw className="size-3.5" />
            Reintentar
          </Button>
        </div>
      )}
      {loadState === "ready" && visible.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No tenés notificaciones sin leer.
        </p>
      )}
      {loadState === "ready" &&
        visible.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onOpen={() => {
              onBeforeOpen?.();
              open(notification);
            }}
            onMarkRead={() => void markRead([notification.id])}
          />
        ))}
    </>
  );

  const loadMoreButton = loadState === "ready" && hasMore && (
    <Button variant="outline" className="self-center" disabled={loadingMore} onClick={() => void loadMore()}>
      {loadingMore ? "Cargando..." : "Cargar más"}
    </Button>
  );

  return (
    <div className={cn("flex w-full flex-col", drawer ? "min-h-0 flex-1" : "mx-auto max-w-2xl gap-4 px-4 py-6 md:px-6")}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2",
          drawer ? "border-b border-border px-4 pt-4 pb-3" : ADMIN_ACTIONS_RESERVE_SHARED
        )}
      >
        {/* En el drawer el botón X ocupa la esquina superior derecha: el título deja ese lugar libre. */}
        <div className={cn(drawer && "w-full pr-10")}>
          {heading}
          <p className="text-sm text-muted-foreground">
            {loadState === "ready" ? (unreadCount > 0 ? `${unreadCount} sin leer` : "Estás al día") : " "}
            {liveState === "reconnecting" && " · reconectando..."}
          </p>
        </div>
        <div className={cn("flex items-center gap-2", drawer && "w-full justify-end")}>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={unreadCount === 0} onClick={() => void markAllRead()}>
            <CheckCheck className="size-3.5" />
            {drawer ? "Marcar todas como leídas" : "Marcar todas"}
          </Button>
        </div>
      </div>

      {drawer ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pb-4">
          <div>{list}</div>
          {loadMoreButton}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-background">{list}</div>
          {loadMoreButton}
        </>
      )}
    </div>
  );
}

/** Historial completo de la bandeja propia (página; se mantiene para accesos directos y compatibilidad). */
export function NotificationsHistory() {
  return <NotificationsPanel variant="page" heading={<h1 className="text-xl font-semibold">Notificaciones</h1>} />;
}
