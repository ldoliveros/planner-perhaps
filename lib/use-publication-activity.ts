"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPermanentChannelError, isPostgresChangesRejection, whileSignedIn } from "@/lib/supabase/realtime-session";
import { getPublicationActivity, listPublicationActivity } from "@/lib/actions/activity";
import type { PublicationActivity } from "@/types";

/**
 * Actividad de una publicación + actualización en vivo (Realtime sobre publication_activity, con su propio canal: si la
 * tabla no estuviera publicada, los comentarios en vivo no se ven afectados).
 * - Los eventos son solo una SEÑAL: se relee el evento bajo RLS (getPublicationActivity).
 * - Un guardado agrupa sus cambios en un evento que se actualiza (UPDATE) mientras dura: se reemplaza por id.
 * - Al reconectar, volver la red o la pestaña: se recarga todo (Realtime no reenvía lo perdido).
 * - Sin la migración: `available` false y sin canal; la cronología muestra solo comentarios.
 */
export function usePublicationActivity(publicationId: string) {
  const [byId, setById] = useState<Map<string, PublicationActivity>>(() => new Map());
  const [available, setAvailable] = useState(true);
  const mountedRef = useRef(true);

  const upsert = useCallback((event: PublicationActivity) => {
    if (!mountedRef.current) return;
    setById((prev) => {
      const existing = prev.get(event.id);
      if (existing && Date.parse(existing.updatedAt) > Date.parse(event.updatedAt)) return prev;
      const next = new Map(prev);
      next.set(event.id, event);
      return next;
    });
  }, []);

  type LoadResult = Awaited<ReturnType<typeof listPublicationActivity>>;
  const applyResult = useCallback((result: LoadResult): LoadResult => {
    if (!mountedRef.current) return result;
    if (result.unavailable) {
      setAvailable(false);
      return result;
    }
    if (!result.error) setById(new Map(result.activity.map((event) => [event.id, event])));
    return result;
  }, []);

  const reload = useCallback(
    (): Promise<LoadResult | null> => listPublicationActivity(publicationId).then(applyResult, () => null),
    [publicationId, applyResult]
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let unavailable = false;
    let wasDisconnected = false;
    let stopChannel: (() => void) | null = null;
    const supabase = createClient();
    const filter = `publication_id=eq.${publicationId}`;

    async function refreshOne(id: unknown) {
      if (typeof id !== "string") return;
      const event = await getPublicationActivity(id).catch(() => null);
      if (!cancelled && event) upsert(event);
    }

    const stopSession = whileSignedIn(({ resumed, recheck }) => {
      if (unavailable) return () => undefined;
      if (resumed) wasDisconnected = true;
      let closed = false;
      const channel = supabase
        .channel(`publication-activity:${publicationId}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "publication_activity", filter }, (payload) => {
          void refreshOne((payload.new as { id?: unknown }).id);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "publication_activity", filter }, (payload) => {
          void refreshOne((payload.new as { id?: unknown }).id);
        })
        .on("system", {}, (payload) => {
          if (cancelled || closed || !isPostgresChangesRejection(payload)) return;
          wasDisconnected = true;
          stop();
          recheck();
        })
        .subscribe((status, err) => {
          if (cancelled || closed) return;
          if (status === "SUBSCRIBED") {
            if (wasDisconnected) {
              wasDisconnected = false;
              void reload();
            }
          } else if (status === "CHANNEL_ERROR") {
            wasDisconnected = true;
            if (isPermanentChannelError(err)) stop();
            recheck();
          } else if (status === "TIMED_OUT" || status === "CLOSED") {
            wasDisconnected = true;
            recheck();
          }
        });
      function stop() {
        if (closed) return;
        closed = true;
        stopChannel = null;
        void supabase.removeChannel(channel);
      }
      stopChannel = stop;
      return stop;
    });

    void listPublicationActivity(publicationId)
      .then(applyResult, () => null)
      .then((result) => {
      if (cancelled || !result?.unavailable) return;
      unavailable = true;
      stopChannel?.();
    });

    function handleResync() {
      if (document.visibilityState === "visible") void reload();
    }
    window.addEventListener("online", handleResync);
    document.addEventListener("visibilitychange", handleResync);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.removeEventListener("online", handleResync);
      document.removeEventListener("visibilitychange", handleResync);
      stopSession();
    };
  }, [publicationId, reload, upsert, applyResult]);

  const activity = useMemo(
    () => [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [byId]
  );

  return { activity, available, reload };
}
