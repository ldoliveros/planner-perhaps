"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Publicaciones en vivo (v1.6): crear, editar (fecha, estado, contenido), archivar, restaurar y eliminar se reflejan
 * en las demás sesiones que miran el mismo calendario, sin recargar ni hacer polling.
 *
 * - Escucha la tabla de AVISOS `public.publication_changes` (supabase/pending-migrations/v1.6/
 *   20261017000002_v16_publication_changes.sql), no `publications`: cada aviso es un INSERT con `publication_id`,
 *   `client_id` y `kind` ('upsert' | 'delete'), que Realtime entrega solo a quien puede ver ese cliente (RLS
 *   can_view_client). Así: (1) un borrado nunca expone ids de publicaciones de otros clientes (los DELETE de
 *   `publications` ya no se publican) y (2) archivar llega también al Client User, aunque la publicación archivada ya
 *   no pase su RLS: el aviso es por cliente, quien escucha relee la publicación y, si ya no la ve, la quita.
 * - Los avisos son SEÑALES: el contenido se relee siempre bajo la RLS de `publications`.
 * - Sin la migración el canal falla en silencio y la pantalla se comporta como antes (sin vivo). Canal PROPIO, separado
 *   de comentarios y notificaciones, que no se ven afectados. Una suscripción por montaje, nombre único, eliminada en
 *   el cleanup.
 */
export function usePublicationsLive({
  clientId,
  onChanged,
  onDeleted,
}: {
  /** Planner de un cliente: filtra por cliente. null = calendario global (la RLS decide qué clientes llegan). */
  clientId: string | null;
  /** 'upsert': algo cambió (incluido archivar/restaurar) → releer. */
  onChanged: (publicationId: string) => void;
  /** 'delete': la publicación se eliminó. */
  onDeleted: (publicationId: string) => void;
}) {
  const onChangedRef = useRef(onChanged);
  const onDeletedRef = useRef(onDeleted);
  useEffect(() => {
    onChangedRef.current = onChanged;
    onDeletedRef.current = onDeleted;
  });

  useEffect(() => {
    const supabase = createClient();
    const filter = clientId ? `client_id=eq.${clientId}` : undefined;
    const channel = supabase
      .channel(`publication-changes:${clientId ?? "global"}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "publication_changes", ...(filter ? { filter } : {}) },
        (payload) => {
          const row = payload.new as { publication_id?: unknown; kind?: unknown };
          if (typeof row.publication_id !== "string") return;
          if (row.kind === "delete") onDeletedRef.current(row.publication_id);
          else onChangedRef.current(row.publication_id);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId]);
}
