"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCheck, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { NotificationItem } from "@/components/notifications/notification-item";
import { ADMIN_ACTIONS_RESERVE_SHARED } from "@/lib/admin-shell";
import { listNotifications } from "@/lib/notifications-api";
import { appendOlderNotifications, upsertNotification } from "@/lib/notification-text";
import { cn } from "cn";
import type { AppNotification } from "@/types";

const ALL_PAGE_SIZE = 20;
type HistoryFilter = "unread" | "all";

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
  const drawer = variant === "drawer";
  // Página: "No leídas" (la bandeja de pendientes del provider) o "Todas" (historial completo, leídas incluidas).
  const [filter, setFilter] = useState<HistoryFilter>("unread");
  const showingAll = !drawer && filter === "all";
  const all = useAllNotifications(showingAll);
  const visible = showingAll ? all.items : items.filter((n) => !n.readAt && !n.suppressedAt);
  const state = showingAll ? all.loadState : loadState;
  const error = showingAll ? all.loadError : loadError;

  const list = (
    <>
      {state === "loading" && (
        <p className="flex items-center gap-1.5 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando notificaciones...
        </p>
      )}
      {state === "unavailable" && (
        <p className="px-4 py-8 text-sm text-muted-foreground">Las notificaciones todavía no están disponibles. {error}</p>
      )}
      {state === "error" && (
        <div className="flex items-center justify-between gap-2 px-4 py-6 text-sm text-destructive">
          <span>No se pudieron cargar las notificaciones. {error}</span>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void (showingAll ? all.reload() : resync())}>
            <RefreshCcw className="size-3.5" />
            Reintentar
          </Button>
        </div>
      )}
      {state === "ready" && visible.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {showingAll ? "Todavía no tenés notificaciones." : "No tenés notificaciones sin leer."}
        </p>
      )}
      {state === "ready" &&
        visible.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onOpen={() => {
              onBeforeOpen?.();
              if (showingAll) all.markLocallyRead([notification.id]);
              open(notification);
            }}
            onMarkRead={() => {
              if (showingAll) all.markLocallyRead([notification.id]);
              void markRead([notification.id]);
            }}
          />
        ))}
    </>
  );

  const moreAvailable = showingAll ? all.hasMore : hasMore;
  const moreLoading = showingAll ? all.loadingMore : loadingMore;
  const loadMoreButton = state === "ready" && moreAvailable && (
    <Button
      variant="outline"
      className="self-center"
      disabled={moreLoading}
      onClick={() => void (showingAll ? all.loadMore() : loadMore())}
    >
      {moreLoading ? "Cargando..." : "Cargar más"}
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
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={unreadCount === 0}
            onClick={() => {
              if (showingAll) all.markLocallyRead(null);
              void markAllRead();
            }}
          >
            <CheckCheck className="size-3.5" />
            {drawer ? "Marcar todas como leídas" : "Marcar todas"}
          </Button>
        </div>
      </div>

      {!drawer && (
        <div role="tablist" aria-label="Filtro de notificaciones" className="flex gap-1 self-start rounded-lg bg-muted p-1">
          {(
            [
              ["unread", "No leídas"],
              ["all", "Todas"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                filter === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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

type AllLoadState = "loading" | "ready" | "error" | "unavailable";

/**
 * "Todas": historial propio completo (leídas, pendientes y de publicaciones archivadas, estas sin enlace). Leer una
 * no la quita. Se mantiene al día con las señales en vivo del provider (relectura bajo RLS y publicaciones borradas).
 */
function useAllNotifications(active: boolean) {
  const { subscribeSignals } = useNotifications();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loadState, setLoadState] = useState<AllLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    listNotifications({ limit: ALL_PAGE_SIZE }).then(
      (page) => {
        if (cancelled) return;
        if (page.error) {
          setLoadError(page.error);
          setLoadState(page.unavailable ? "unavailable" : "error");
          return;
        }
        setItems(page.items);
        setHasMore(page.hasMore);
        setLoadError(null);
        setLoadState("ready");
      },
      () => {
        if (cancelled) return;
        setLoadError("No se pudo conectar con el servidor.");
        setLoadState("error");
      }
    );
    const stop = subscribeSignals((signal) => {
      if (signal.kind === "publication-deleted") {
        setItems((prev) => prev.filter((n) => n.publicationId !== signal.publicationId));
      } else if (!signal.notification) {
        setItems((prev) => prev.filter((n) => n.id !== signal.id));
      } else {
        const fresh = signal.notification;
        setItems((prev) =>
          upsertNotification(
            // Archivada (o sin acceso): vale para todos los avisos de esa publicación, también los ya leídos.
            fresh.publicationUnavailable && fresh.publicationId
              ? prev.map((n) => (n.publicationId === fresh.publicationId ? { ...n, publicationUnavailable: true } : n))
              : prev,
            fresh
          )
        );
      }
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [active, subscribeSignals, reloadKey]);

  const reload = useCallback(() => {
    setLoadState("loading");
    setReloadKey((key) => key + 1);
  }, []);

  const loadMore = useCallback(async () => {
    const oldest = items[items.length - 1];
    if (!oldest || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await listNotifications({ before: { createdAt: oldest.createdAt, id: oldest.id }, limit: ALL_PAGE_SIZE });
      if (!page.error) {
        setItems((prev) => appendOlderNotifications(prev, page.items));
        setHasMore(page.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [items, loadingMore, hasMore]);

  /** Marcar leída en "Todas" no la quita: solo cambia su estado (la base lo confirma por la señal en vivo). */
  const markLocallyRead = useCallback((ids: string[] | null) => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (!n.readAt && (ids === null || ids.includes(n.id)) ? { ...n, readAt: now } : n)));
  }, []);

  return { items, loadState, loadError, hasMore, loadingMore, loadMore, reload, markLocallyRead };
}

/** Historial completo de la bandeja propia (página; se mantiene para accesos directos y compatibilidad). */
export function NotificationsHistory() {
  return <NotificationsPanel variant="page" heading={<h1 className="text-xl font-semibold">Notificaciones</h1>} />;
}
