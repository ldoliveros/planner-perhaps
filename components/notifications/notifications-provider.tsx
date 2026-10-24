"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getNotification,
  listNotifications,
  markNotificationsRead,
  markPublicationNotificationsRead,
  type NotificationsPage,
} from "@/lib/notifications-api";
import { claimNotificationToast } from "@/lib/notification-toast-dedupe";
import {
  appendOlderNotifications,
  describeNotification,
  mergeNotificationsPage,
  notificationHref,
  upsertNotification,
} from "@/lib/notification-text";
import { toast } from "@/lib/toast";
import type { AppNotification } from "@/types";

const PAGE_SIZE = 20;

export type NotificationsLoadState = "loading" | "ready" | "error" | "unavailable";
export type NotificationsLiveState = "connecting" | "live" | "reconnecting" | "unavailable";

/**
 * Publicación abierta en una Vista de Publicación (PublicationView la registra al montarse). Permite:
 *   * que una notificación nueva sobre ESA publicación se marque leída al instante y refresque la vista;
 *   * que abrir otra publicación desde la campanita o un toast pase por la vista (que decide sin descartar
 *     cambios sin guardar) en vez de navegar y desmontarla.
 */
export interface OpenPublicationHandle {
  publicationId: string | null;
  /**
   * ¿La conversación (pestaña Comentarios) está efectivamente a la vista? Un comentario o mención de la publicación
   * abierta solo se da por leído si se está mostrando; si no, queda sin leer en la campanita (con su toast).
   */
  isShowingComments?: () => boolean;
  /** Llegó una notificación de la publicación abierta (los cambios de estado ya se marcaron como leídos). */
  onRelatedNotification: (notification: AppNotification) => void;
  /** Se pidió abrir otra publicación mientras esta vista está abierta. */
  onOpenRequest: (notification: AppNotification) => void;
}

interface NotificationsContextValue {
  items: AppNotification[];
  unreadCount: number;
  loadState: NotificationsLoadState;
  loadError: string | null;
  liveState: NotificationsLiveState;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  resync: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  markPublicationRead: (publicationId: string) => Promise<void>;
  /** Marca como leída y navega a la publicación (/p/<id>) — o, si hay una Vista de Publicación abierta, le
   * delega la decisión (ver OpenPublicationHandle). */
  open: (notification: AppNotification) => void;
  /** Navega a la publicación sin consultar a la vista abierta (la vista ya decidió). */
  navigateTo: (notification: AppNotification) => void;
  /** Registra la vista abierta; devuelve la función para desregistrarla. */
  registerOpenPublication: (handle: OpenPublicationHandle) => () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Campanita / historial: exige el provider (montado en los layouts de admin y cliente). */
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications requiere <NotificationsProvider>.");
  return ctx;
}

/** Para componentes que también se usan fuera de los layouts con provider (p. ej. PublicationView). */
export function useOptionalNotifications(): NotificationsContextValue | null {
  return useContext(NotificationsContext);
}

/**
 * Bandeja interna del usuario autenticado (v1.6, Fase 4). Se monta UNA vez por layout (admin / cliente), así hay
 * una sola suscripción Realtime por pestaña, compartida por la campanita de desktop, la de mobile y el historial.
 *
 * - Bandeja de PENDIENTES: solo se cargan y se muestran notificaciones no leídas. Las leídas siguen en la base pero
 *   salen de la lista al instante (marcar una, marcar todas, abrirla, o leerla en otra pestaña: llega el UPDATE
 *   por Realtime y se quita también allí).
 *
 * - La base es la fuente de verdad: el contador siempre viene de un COUNT en la base (al cargar, en cada evento,
 *   al marcar y al resincronizar), nunca de sumar/restar eventos del socket.
 * - Los eventos Realtime son solo señales: la notificación se relee bajo RLS (getNotification).
 * - Realtime no recupera eventos perdidos: al volver a SUBSCRIBED tras un corte, al recuperar la red y al volver a
 *   la pestaña se resincroniza contra la base.
 * - Sin duplicados: estado indexado por id; toasts deduplicados por pestaña y entre pestañas
 *   (lib/notification-toast-dedupe.ts).
 * - Canal con nombre único por montaje y eliminado en el cleanup.
 */
export function NotificationsProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadState, setLoadState] = useState<NotificationsLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<NotificationsLiveState>("connecting");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const mountedRef = useRef(true);
  const shownToasts = useRef<Set<string>>(new Set());
  // Solo se notifican con toast eventos posteriores al montaje (con margen por desfase de reloj).
  const mountedAtRef = useRef<number>(0);
  // Vista de Publicación abierta (a lo sumo una: es un diálogo modal).
  const openViewRef = useRef<OpenPublicationHandle | null>(null);
  // `open` se define más abajo; el toast lo usa vía ref para no depender del orden de los callbacks.
  const openRef = useRef<(notification: AppNotification) => void>(() => undefined);
  const markReadRef = useRef<(ids: string[]) => Promise<void>>(async () => undefined);

  const applyPage = useCallback((page: NotificationsPage, mode: "replace-recent" | "append"): void => {
    if (!mountedRef.current) return;
    if (page.error) {
      setLoadError(page.error);
      setLoadState((prev) => (page.unavailable ? "unavailable" : prev === "ready" ? prev : "error"));
      return;
    }
    setLoadError(null);
    setLoadState("ready");
    setUnreadCount(page.unreadCount);
    if (mode === "append") {
      setItems((prev) => appendOlderNotifications(prev, page.items));
      setHasMore(page.hasMore);
    } else {
      setItems((prev) => mergeNotificationsPage(prev, page.items, !page.hasMore));
      setHasMore((prevHasMore) => prevHasMore || page.hasMore);
    }
  }, []);

  const applyFailure = useCallback(() => {
    if (!mountedRef.current) return;
    setLoadError("No se pudo conectar con el servidor.");
    setLoadState((prev) => (prev === "ready" ? prev : "error"));
  }, []);

  const resync = useCallback(
    () =>
      listNotifications({ limit: PAGE_SIZE, unreadOnly: true }).then(
        (page) => applyPage(page, "replace-recent"),
        applyFailure
      ),
    [applyPage, applyFailure]
  );

  const showToast = useCallback(
    (notification: AppNotification) => {
      const href = notificationHref(notification);
      void claimNotificationToast(notification.id, shownToasts.current).then((mine) => {
        if (!mine || !mountedRef.current || !href) return;
        toast.notification(describeNotification(notification), undefined, {
          label: "Abrir",
          onClick: () => openRef.current(notification),
        });
      });
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    mountedAtRef.current = Date.now();
    let cancelled = false;
    let wasDisconnected = false;
    const supabase = createClient();
    const filter = `recipient_id=eq.${userId}`;

    function handleSignal(id: unknown, isInsert: boolean) {
      if (typeof id !== "string") return;
      getNotification(id).then(({ notification, unreadCount: count }) => {
        if (cancelled || !mountedRef.current) return;
        if (count !== null) setUnreadCount(count);
        if (!notification) {
          // Ya no visible (p. ej. sin acceso al cliente): fuera de la bandeja.
          setItems((prev) => prev.filter((n) => n.id !== id));
          return;
        }
        // Bandeja de pendientes: una notificación leída (aquí o en otra pestaña) sale de la lista.
        setItems((prev) =>
          notification.readAt ? prev.filter((n) => n.id !== notification.id) : upsertNotification(prev, notification)
        );
        const openView = openViewRef.current;
        if (isInsert && openView && notification.publicationId && openView.publicationId === notification.publicationId) {
          // El usuario está en esa publicación. Cambio de estado: se marca leída y se avisa a la vista, sin toast.
          // Comentario/mención (v1.6): solo se da por leído si la conversación está a la vista; si está en
          // Edición/Publicación queda sin leer (campanita y contador de la pestaña) y sigue al toast de siempre.
          const isComment = notification.type === "comment" || notification.type === "mention";
          const seen = !isComment || openView.isShowingComments?.() === true;
          openView.onRelatedNotification(notification);
          if (seen) {
            if (!notification.readAt) void markReadRef.current([notification.id]);
            return;
          }
        }
        // Un INSERT de Realtime siempre es una fila nueva (Realtime no reenvía historial); el margen solo descarta
        // algo claramente viejo. 5 min tolera relojes del equipo desfasados respecto de la base (con 30 s, un reloj
        // adelantado suprimía el toast).
        const isFresh = Date.parse(notification.createdAt) >= mountedAtRef.current - 5 * 60_000;
        if (isInsert && !notification.readAt && isFresh) showToast(notification);
      }, () => {
        // Falló la relectura (red): se resincroniza contador y bandeja contra la base en vez de perder el evento.
        if (!cancelled) void resync();
      });
    }

    // Suscribir antes de cargar: un evento entre la carga y la suscripción no se pierde.
    const channel = supabase
      .channel(`notifications:${userId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, (payload) =>
        handleSignal((payload.new as { id?: unknown }).id, true)
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, (payload) =>
        // Leída en otra pestaña / dispositivo: se refleja acá.
        handleSignal((payload.new as { id?: unknown }).id, false)
      )
      .subscribe((status, err) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setLiveState("live");
          if (wasDisconnected) {
            wasDisconnected = false;
            void resync();
          }
        } else if (status === "CHANNEL_ERROR") {
          wasDisconnected = true;
          const notEnabled = /subscribe to changes|does not exist|not found/i.test(err?.message ?? "");
          setLiveState(notEnabled ? "unavailable" : "reconnecting");
        } else if (status === "TIMED_OUT" || status === "CLOSED") {
          wasDisconnected = true;
          setLiveState("reconnecting");
        }
      });

    listNotifications({ limit: PAGE_SIZE, unreadOnly: true })
      .then((page) => {
        applyPage(page, "replace-recent");
        if (!cancelled && page.unavailable) {
          // v1.6 no instalada: sin canal abierto.
          setLiveState("unavailable");
          void supabase.removeChannel(channel);
        }
      }, applyFailure);

    function handleResync() {
      if (document.visibilityState === "visible") void resync();
    }
    window.addEventListener("online", handleResync);
    document.addEventListener("visibilitychange", handleResync);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.removeEventListener("online", handleResync);
      document.removeEventListener("visibilitychange", handleResync);
      void supabase.removeChannel(channel);
    };
  }, [userId, applyPage, applyFailure, resync, showToast]);

  const loadMore = useCallback(async () => {
    const oldest = items[items.length - 1];
    if (!oldest || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await listNotifications({
        before: { createdAt: oldest.createdAt, id: oldest.id },
        limit: PAGE_SIZE,
        unreadOnly: true,
      });
      if (page.error) {
        toast.error("No se pudieron cargar más notificaciones", page.error);
        return;
      }
      applyPage(page, "append");
    } catch {
      toast.error("No se pudieron cargar más notificaciones", "No se pudo conectar con el servidor.");
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [items, loadingMore, hasMore, applyPage]);

  /** Marca optimista (sale de la bandeja al instante) + confirmación con la base; si falla, se resincroniza. */
  const runMark = useCallback(
    async (localPredicate: (n: AppNotification) => boolean, action: () => ReturnType<typeof markNotificationsRead>) => {
      // El contador lo confirma la base al terminar ("Marcar todas" ya lo puso en 0).
      setItems((prev) => prev.filter((n) => !localPredicate(n)));
      try {
        const result = await action();
        if (result.error) {
          if (!result.unavailable) toast.error("No se pudieron marcar como leídas", result.error);
          void resync();
          return;
        }
        if (result.unreadCount !== null) setUnreadCount(result.unreadCount);
      } catch {
        void resync();
      }
    },
    [resync]
  );

  const markRead = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      return runMark((n) => set.has(n.id), () => markNotificationsRead(ids));
    },
    [runMark]
  );
  const markAllRead = useCallback(() => {
    // Todas las pendientes del usuario (también las no cargadas): bandeja y contador vacíos al instante.
    setUnreadCount(0);
    setHasMore(false);
    return runMark(() => true, () => markNotificationsRead(null));
  }, [runMark]);
  const markPublicationRead = useCallback(
    (publicationId: string) =>
      runMark((n) => n.publicationId === publicationId, () => markPublicationNotificationsRead(publicationId)),
    [runMark]
  );

  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);


  const navigateTo = useCallback(
    (notification: AppNotification) => {
      if (!notification.readAt) void markRead([notification.id]);
      const href = notificationHref(notification);
      if (href) router.push(href);
    },
    [markRead, router]
  );

  const open = useCallback(
    (notification: AppNotification) => {
      const openView = openViewRef.current;
      if (openView) {
        // Hay una Vista de Publicación abierta: navegar la desmontaría y perdería cambios sin guardar. La vista
        // decide (misma publicación: nada que hacer; otra: confirma o pide guardar primero).
        if (!notification.readAt) void markRead([notification.id]);
        openView.onOpenRequest(notification);
        return;
      }
      navigateTo(notification);
    },
    [markRead, navigateTo]
  );
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const registerOpenPublication = useCallback((handle: OpenPublicationHandle) => {
    openViewRef.current = handle;
    return () => {
      if (openViewRef.current === handle) openViewRef.current = null;
    };
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unreadCount,
      loadState,
      loadError,
      liveState,
      hasMore,
      loadingMore,
      loadMore,
      resync,
      markRead,
      markAllRead,
      markPublicationRead,
      open,
      navigateTo,
      registerOpenPublication,
    }),
    [
      items,
      unreadCount,
      loadState,
      loadError,
      liveState,
      hasMore,
      loadingMore,
      loadMore,
      resync,
      markRead,
      markAllRead,
      markPublicationRead,
      open,
      navigateTo,
      registerOpenPublication,
    ]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
