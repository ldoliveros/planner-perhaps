"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addPublicationComment,
  deletePublicationComment,
  editPublicationComment,
  getPublicationComment,
  listCommentReactions,
  listPublicationComments,
  setCommentReaction,
  type CommentMutationResult,
} from "@/lib/actions/comments";
import { COMMENT_REACTION_EMOJIS, type CommentReaction, type CommentReactionEmoji, type PublicationComment } from "@/types";

/**
 * v1.6 reacciones: ¿la tabla existe y está en Realtime? Se aprende con la primera carga y se recuerda en la pestaña:
 * el listener de reacciones se agrega al MISMO canal de comentarios solo cuando se sabe que existe (suscribirse a una
 * tabla que no está en la publicación haría fallar el canal entero, también los comentarios en vivo).
 */
let reactionsTableAvailable: boolean | null = null;

function reactionKey(r: Pick<CommentReaction, "commentId" | "userId" | "emoji">): string {
  return `${r.commentId}|${r.userId}|${r.emoji}`;
}

export type CommentsLoadState = "loading" | "ready" | "error" | "unavailable";
/** live: suscripto · connecting: primera conexión · reconnecting: se cortó y realtime-js reintenta ·
 * unavailable: Realtime no habilitado para estas tablas (o v1.6 no instalada) — el panel sigue funcionando
 * sin vivo, con recarga manual / al volver a la pestaña. */
export type CommentsLiveState = "connecting" | "live" | "reconnecting" | "unavailable";

function isNewer(candidate: PublicationComment, existing: PublicationComment | undefined): boolean {
  if (!existing) return true;
  return Date.parse(candidate.updatedAt) >= Date.parse(existing.updatedAt);
}

/**
 * Historial de comentarios de una publicación + actualización en vivo (Supabase Realtime, postgres_changes).
 *
 * - Una suscripción por montaje, con nombre de canal único: un remount (StrictMode, reabrir la vista) nunca
 *   comparte ni duplica el canal anterior, que se elimina en el cleanup (supabase.removeChannel).
 * - Los eventos son solo una SEÑAL: el comentario se relee con getPublicationComment (bajo RLS) en vez de
 *   confiar en el payload del socket.
 * - Sin duplicados: el estado es un Map por id y solo se reemplaza una entrada por otra igual o más nueva
 *   (updated_at). El eco Realtime de un comentario propio pisa la misma entrada que ya puso la mutación.
 * - Reconexión: al volver a SUBSCRIBED tras un corte, y al volver la red o la pestaña, se recarga todo el
 *   historial (Realtime no reenvía lo que pasó mientras estaba desconectado).
 * - `liveStatusId`: último cambio de estado recibido en vivo (publication_status_events), para cerrar/abrir
 *   el editor sin esperar a recargar la vista.
 */
export function usePublicationComments(publicationId: string) {
  const [byId, setById] = useState<Map<string, PublicationComment>>(() => new Map());
  const [loadState, setLoadState] = useState<CommentsLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<CommentsLiveState>("connecting");
  const [liveStatusId, setLiveStatusId] = useState<string | null>(null);
  const [repliesSupported, setRepliesSupported] = useState(false);
  const [reactionsSupported, setReactionsSupported] = useState<boolean>(reactionsTableAvailable === true);
  const [reactionsByKey, setReactionsByKey] = useState<Map<string, CommentReaction>>(() => new Map());
  const mountedRef = useRef(true);

  const upsert = useCallback((comment: PublicationComment) => {
    if (!mountedRef.current) return;
    setById((prev) => {
      if (!isNewer(comment, prev.get(comment.id))) return prev;
      const next = new Map(prev);
      next.set(comment.id, comment);
      return next;
    });
  }, []);

  type LoadOutcome = "ready" | "error" | "unavailable";

  const applyLoadFailure = useCallback((): LoadOutcome => {
    if (!mountedRef.current) return "error";
    setLoadError("No se pudo conectar con el servidor.");
    // Si ya había historial cargado, se conserva (solo falló una resincronización).
    setLoadState((prev) => (prev === "ready" ? prev : "error"));
    return "error";
  }, []);

  const applyLoadResult = useCallback((result: Awaited<ReturnType<typeof listPublicationComments>>): LoadOutcome => {
    if (!mountedRef.current) return "error";
    setCurrentUserId(result.currentUserId);
    if (result.error) {
      setLoadError(result.error);
      setLoadState(result.unavailable ? "unavailable" : "error");
      return result.unavailable ? "unavailable" : "error";
    }
    setLoadError(null);
    setLoadState("ready");
    setRepliesSupported(result.repliesSupported);
    setById((prev) => {
      // Merge (no reemplazo): un evento que llegó mientras se cargaba no se pierde si es más nuevo.
      const next = new Map(prev);
      for (const comment of result.comments) {
        if (isNewer(comment, next.get(comment.id))) next.set(comment.id, comment);
      }
      return next;
    });
    return "ready";
  }, []);

  /** Reacciones activas (la base manda: reemplaza lo local). Sin la tabla: no soportadas, sin error visible. */
  const loadReactions = useCallback(async () => {
    try {
      const result = await listCommentReactions(publicationId);
      if (!mountedRef.current) return;
      reactionsTableAvailable = result.supported;
      setReactionsSupported(result.supported);
      if (result.error) return;
      setReactionsByKey(new Map(result.reactions.map((r) => [reactionKey(r), r])));
    } catch {
      // Sin red: se reintenta en la próxima resincronización.
    }
  }, [publicationId]);

  const reload = useCallback(
    (): Promise<LoadOutcome> =>
      listPublicationComments(publicationId)
        .then(applyLoadResult, applyLoadFailure)
        .then((outcome) => {
          if (outcome === "ready") void loadReactions();
          return outcome;
        }),
    [publicationId, applyLoadResult, applyLoadFailure, loadReactions]
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let wasDisconnected = false;
    const supabase = createClient();
    const filter = `publication_id=eq.${publicationId}`;

    async function refreshOne(commentId: unknown) {
      if (typeof commentId !== "string") return;
      const comment = await getPublicationComment(commentId);
      if (!cancelled && comment) upsert(comment);
    }

    // Suscribir ANTES de cargar: un comentario que entra entre la carga y la suscripción no se pierde.
    let channel = supabase.channel(`publication-comments:${publicationId}:${crypto.randomUUID()}`);
    if (reactionsSupported) {
      // v1.6 reacciones en el MISMO canal. Solo UPDATE/INSERT (quitar = active false): pasan por la RLS de la tabla.
      const onReaction = (row: { comment_id?: unknown; user_id?: unknown; emoji?: unknown; active?: unknown }) => {
        if (cancelled || typeof row.comment_id !== "string" || typeof row.user_id !== "string") return;
        if (!(COMMENT_REACTION_EMOJIS as readonly unknown[]).includes(row.emoji)) return;
        const reaction: CommentReaction = { commentId: row.comment_id, userId: row.user_id, emoji: row.emoji as CommentReactionEmoji };
        setReactionsByKey((prev) => {
          const next = new Map(prev);
          if (row.active === true) next.set(reactionKey(reaction), reaction);
          else next.delete(reactionKey(reaction));
          return next;
        });
      };
      channel = channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "publication_comment_reactions", filter }, (payload) =>
          onReaction(payload.new as Record<string, unknown>)
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "publication_comment_reactions", filter }, (payload) =>
          onReaction(payload.new as Record<string, unknown>)
        );
    }
    channel = channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "publication_comments", filter }, (payload) => {
        void refreshOne((payload.new as { id?: unknown }).id);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "publication_comments", filter }, (payload) => {
        void refreshOne((payload.new as { id?: unknown }).id);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "publication_status_events", filter }, (payload) => {
        const toStatusId = (payload.new as { to_status_id?: unknown }).to_status_id;
        if (!cancelled && typeof toStatusId === "string") setLiveStatusId(toStatusId);
      })
      .subscribe((status, err) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setLiveState("live");
          if (wasDisconnected) {
            wasDisconnected = false;
            void reload();
          }
        } else if (status === "CHANNEL_ERROR") {
          wasDisconnected = true;
          // Tablas fuera de la publicación supabase_realtime (Realtime no habilitado todavía para v1.6).
          const notEnabled = /subscribe to changes|does not exist|not found/i.test(err?.message ?? "");
          setLiveState(notEnabled ? "unavailable" : "reconnecting");
        } else if (status === "TIMED_OUT" || status === "CLOSED") {
          wasDisconnected = true;
          setLiveState("reconnecting");
        }
      });

    listPublicationComments(publicationId)
      .then(applyLoadResult, applyLoadFailure)
      .then((outcome) => {
        if (!cancelled && outcome === "ready") void loadReactions();
        if (cancelled || outcome !== "unavailable") return;
        // v1.6 no instalada: no tiene sentido mantener el canal abierto.
        setLiveState("unavailable");
        void supabase.removeChannel(channel);
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
      void supabase.removeChannel(channel);
    };
    // reactionsSupported: al descubrir la tabla de reacciones se rearma UNA vez el canal con su listener.
  }, [publicationId, reload, upsert, applyLoadResult, applyLoadFailure, loadReactions, reactionsSupported]);

  const comments = useMemo(
    () => [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [byId]
  );

  const applyMutation = useCallback(
    (result: CommentMutationResult): CommentMutationResult => {
      if (result.comment) upsert(result.comment);
      return result;
    },
    [upsert]
  );

  const add = useCallback(
    async (body: string, mentionIds: string[], requestId: string, replyToCommentId?: string | null) =>
      applyMutation(
        await addPublicationComment(publicationId, body, mentionIds, requestId, repliesSupported ? replyToCommentId : null)
      ),
    [publicationId, applyMutation, repliesSupported]
  );
  const edit = useCallback(
    async (commentId: string, body: string, mentionIds: string[]) =>
      applyMutation(await editPublicationComment(commentId, body, mentionIds)),
    [applyMutation]
  );
  const remove = useCallback(
    async (commentId: string) => applyMutation(await deletePublicationComment(commentId)),
    [applyMutation]
  );

  const reactions = useMemo(() => [...reactionsByKey.values()], [reactionsByKey]);

  /** Agregar / quitar la reacción PROPIA: optimista, y vuelve atrás si la base la rechaza. */
  const toggleReaction = useCallback(
    async (commentId: string, emoji: CommentReactionEmoji): Promise<string | null> => {
      if (!currentUserId) return "No se pudo identificar al usuario.";
      const reaction: CommentReaction = { commentId, userId: currentUserId, emoji };
      const key = reactionKey(reaction);
      const active = !reactionsByKey.has(key);
      const apply = (on: boolean) =>
        setReactionsByKey((prev) => {
          const next = new Map(prev);
          if (on) next.set(key, reaction);
          else next.delete(key);
          return next;
        });
      apply(active);
      try {
        const result = await setCommentReaction(commentId, emoji, active);
        if (result.error) {
          apply(!active);
          return result.error;
        }
        return null;
      } catch {
        apply(!active);
        return "No se pudo conectar con el servidor.";
      }
    },
    [currentUserId, reactionsByKey]
  );

  return {
    comments,
    loadState,
    loadError,
    currentUserId,
    liveState,
    liveStatusId,
    reload,
    add,
    edit,
    remove,
    repliesSupported,
    reactionsSupported,
    reactions,
    toggleReaction,
  };
}
