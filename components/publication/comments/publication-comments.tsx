"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, CornerUpLeft, Loader2, MessageSquare, Pencil, RefreshCcw, Reply, SmilePlus, Trash2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useLookups } from "@/components/providers/lookups-provider";
import { listMentionableMembers, listUnreadPublicationComments, markPublicationCommentsRead } from "@/lib/actions/comments";
import { usePublicationComments, type CommentsLiveState } from "@/lib/use-publication-comments";
import { toast } from "@/lib/toast";
import { cn } from "cn";
import {
  COMMENT_REACTION_EMOJIS,
  type CommentReaction,
  type CommentReactionEmoji,
  type MentionableMember,
  type PublicationComment,
} from "@/types";
import { activeMentionIds, type SelectedMention } from "@/lib/mentions";
import { MentionTextarea } from "./mention-textarea";

const MAX_COMMENT_LENGTH = 5000;

function formatCommentDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resalta "@Nombre" de nombres conocidos (mencionables + autores del hilo). Solo nodos de texto: sin HTML. */
function renderBody(body: string, knownNames: string[]): React.ReactNode {
  const names = knownNames.filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) return body;
  const pattern = new RegExp(`@(${names.map(escapeRegExp).join("|")})`, "gu");
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(body.slice(last, index));
    parts.push(
      <span key={index} className="rounded-[4px] bg-[#EEF3FA] px-1 py-px font-medium text-[#24467A] [box-decoration-break:clone]">
        {match[0]}
      </span>
    );
    last = index + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

const LIVE_LABELS: Record<CommentsLiveState, string | null> = {
  connecting: "Conectando...",
  live: "En vivo",
  reconnecting: "Reconectando...",
  unavailable: null,
};

interface PublicationCommentsProps {
  publicationId: string;
  clientId: string;
  /** Estado GUARDADO de la publicación (no el elegido sin guardar en el editor). */
  statusId: string;
  /** Llega en vivo un cambio de estado hecho por otro (o por uno mismo): el caller puede recargar su vista. */
  onRemoteStatusChange?: (statusId: string) => void;
  /**
   * Comentarios PENDIENTES del usuario actual, para el contador de la pestaña Comentarios (null = sin contador:
   * todavía cargando o lectura por usuario no disponible).
   */
  onUnreadCountChange?: (count: number | null) => void;
  /** La pestaña Comentarios está a la vista: con la ventana visible, lo que se muestra se da por leído. */
  active?: boolean;
  /** Dentro de su propia pestaña: sin el separador superior que usa cuando va debajo de otro contenido. */
  embedded?: boolean;
}

/**
 * Comentarios de una publicación (v1.6), dentro de PublicationView para agencia y cliente: editor arriba,
 * historial debajo del más reciente al más antiguo. Se comenta, edita y elimina solo En revisión; en
 * cualquier otro estado el historial queda visible en solo lectura. Editar/Eliminar se ofrecen únicamente
 * en comentarios propios — la base lo vuelve a validar en cada RPC (nunca depende solo de esta UI).
 */
export function PublicationComments({
  publicationId,
  clientId,
  statusId,
  onRemoteStatusChange,
  onUnreadCountChange,
  active = false,
  embedded = false,
}: PublicationCommentsProps) {
  const { statuses } = useLookups();
  const {
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
  } = usePublicationComments(publicationId);
  const visibleCount = comments.filter((c) => c.deletedAt === null).length;

  // ---- Comentarios no leídos (v1.6, lectura por usuario y comentario: publication_comment_reads) ----
  // Pendientes según la base (lista completa) + lo que llega después de consultarla. `snapshot` = ids que ya estaban
  // cargados al pedir la lista: si uno de esos no vino como pendiente, ya estaba leído; uno que llegó después
  // (Realtime) es nuevo y queda pendiente hasta mostrarse. `marked` = leídos en esta sesión (optimista).
  const [unreadState, setUnreadState] = useState<{ ids: Set<string>; snapshot: Set<string> } | null>(null);
  const [unreadUnavailable, setUnreadUnavailable] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(() => new Set());
  const unreadRequested = useRef(false);
  useEffect(() => {
    if (loadState !== "ready" || unreadRequested.current) return;
    unreadRequested.current = true;
    const snapshot = new Set(comments.map((c) => c.id));
    listUnreadPublicationComments(publicationId)
      .then((result) => {
        if (result.error) {
          // Sin la migración (o con error) la pestaña queda sin contador; nunca un número inventado.
          setUnreadUnavailable(true);
          return;
        }
        setUnreadState({ ids: new Set(result.ids), snapshot });
      })
      .catch(() => setUnreadUnavailable(true));
    // Una vez por publicación, cuando el historial terminó de cargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState, publicationId]);

  const unreadIds = unreadState
    ? comments
        .filter(
          (c) =>
            c.deletedAt === null &&
            Boolean(currentUserId) &&
            c.authorId !== currentUserId &&
            !marked.has(c.id) &&
            (unreadState.ids.has(c.id) || !unreadState.snapshot.has(c.id))
        )
        .map((c) => c.id)
    : [];
  const unreadKey = unreadIds.join(",");

  useEffect(() => {
    onUnreadCountChange?.(unreadState && !unreadUnavailable ? unreadIds.length : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey, unreadState, unreadUnavailable]);

  // Visibilidad de la ventana: con la pestaña Comentarios activa y la ventana visible, los pendientes YA renderizados
  // (este efecto corre después del render) se marcan leídos; si no, se conservan.
  const [windowVisible, setWindowVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );
  useEffect(() => {
    const update = () => setWindowVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  // Ids con la constancia en curso (no se piden dos veces); pasan a `marked` cuando la base la confirma.
  const markingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!active || !windowVisible) return;
    const ids = unreadIds.filter((id) => !markingRef.current.has(id));
    if (ids.length === 0) return;
    for (const id of ids) markingRef.current.add(id);
    const release = () => {
      for (const id of ids) markingRef.current.delete(id);
    };
    markPublicationCommentsRead(publicationId, ids)
      .then((result) => {
        release();
        // Sin constancia (error): siguen pendientes y se reintenta en el próximo render visible.
        if (!result.error) setMarked((prev) => new Set([...prev, ...ids]));
      })
      .catch(release);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, windowVisible, unreadKey, publicationId]);

  // Estado efectivo: el guardado (prop) salvo que haya llegado un cambio en vivo posterior. Cuando el prop cambia
  // (el caller recargó o guardó), vuelve a mandar — ajuste durante el render, no en un efecto.
  const [lastPropStatusId, setLastPropStatusId] = useState(statusId);
  const [liveOverride, setLiveOverride] = useState<string | null>(null);
  const [lastLiveStatusId, setLastLiveStatusId] = useState<string | null>(null);
  if (statusId !== lastPropStatusId) {
    setLastPropStatusId(statusId);
    setLiveOverride(null);
  }
  if (liveStatusId !== lastLiveStatusId) {
    setLastLiveStatusId(liveStatusId);
    if (liveStatusId) setLiveOverride(liveStatusId);
  }
  // Avisar al caller fuera del render (puede actualizar el estado de otro componente).
  useEffect(() => {
    if (liveStatusId) onRemoteStatusChange?.(liveStatusId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStatusId]);
  const effectiveStatusId = liveOverride ?? statusId;
  const effectiveStatus = statuses.find((s) => s.id === effectiveStatusId);
  const commentsOpen = effectiveStatus?.key === "in_review";

  const [members, setMembers] = useState<MentionableMember[] | null>(null);
  // Una sola carga en curso por panel; "Responder" espera la misma promesa que el selector "@".
  const membersRequest = useRef<Promise<MentionableMember[]> | null>(null);
  function loadMembers(): Promise<MentionableMember[]> {
    if (membersRequest.current) return membersRequest.current;
    membersRequest.current = listMentionableMembers(clientId)
      .then((result) => {
        if (result.error) {
          membersRequest.current = null;
          setMembers([]);
          toast.error("No se pudieron cargar los usuarios para mencionar", result.error);
          return [];
        }
        setMembers(result.members);
        return result.members;
      })
      .catch(() => {
        membersRequest.current = null;
        setMembers([]);
        return [];
      });
    return membersRequest.current;
  }

  const [draft, setDraft] = useState("");
  const [draftMentions, setDraftMentions] = useState<SelectedMention[]>([]);
  const [sending, setSending] = useState(false);
  // Fijo por borrador hasta que se publica: si el envío falla por red y se reintenta, la RPC devuelve el mismo
  // comentario en vez de crear otro.
  const draftRequestId = useRef<string>(crypto.randomUUID());
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  // "Respondiendo a…" (v1.6): contexto VISUAL del borrador mientras se escribe. No se guarda: el esquema actual no
  // tiene la relación entre comentarios (ver propuesta reply_to_comment_id), así que al publicar solo queda la
  // mención, como antes — nunca una referencia que desaparecería al recargar.
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string; excerpt: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  function scrollToComment(commentId: string) {
    const el = document.getElementById(`comment-${commentId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(commentId);
    window.setTimeout(() => setHighlightId((current) => (current === commentId ? null : current)), 1600);
  }

  // Con la conversación abierta para escribir, se cargan los mencionables (una vez): deciden dónde se ofrece
  // "Responder" (solo a autores mencionables).
  useEffect(() => {
    if (loadState === "ready" && commentsOpen) void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState, commentsOpen]);

  /**
   * "Responder" (v1.6): agrega al final del borrador (sin borrar lo ya escrito) una mención al autor, con el mismo
   * mecanismo que el selector "@" — solo si es mencionable (miembro activo del cliente; la base lo vuelve a validar
   * y es la mención la que genera su notificación). Enfoca el editor con el cursor después de la mención. Sin hilos.
   */
  async function handleReply(comment: PublicationComment) {
    if (!comment.authorId || comment.authorId === currentUserId) return;
    const list = members ?? (await loadMembers());
    const member = list.find((m) => m.id === comment.authorId);
    const el = draftRef.current;
    if (!member) {
      toast.info(`No se puede mencionar a ${comment.authorName}`, "Ya no es un usuario activo de este cliente.");
      el?.focus();
      return;
    }
    setReplyTo({
      id: comment.id,
      authorName: comment.authorName,
      excerpt: comment.body.replace(/\s+/g, " ").trim().slice(0, 140),
    });
    const mention = `@${member.fullName}`;
    // Texto vigente del editor (puede haber cambiado mientras se cargaban los mencionables).
    const current = el?.value ?? draft;
    let nextValue = current;
    if (!current.includes(mention)) {
      const separator = current.length === 0 || /\s$/.test(current) ? "" : " ";
      nextValue = `${current}${separator}${mention} `;
      setDraft(nextValue);
    }
    if (!draftMentions.some((m) => m.id === member.id)) {
      setDraftMentions([...draftMentions, { id: member.id, name: member.fullName }]);
    }
    const caret = nextValue.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editMentions, setEditMentions] = useState<SelectedMention[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicationComment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const knownNames = [...new Set([...(members ?? []).map((m) => m.fullName), ...comments.map((c) => c.authorName)])];
  const commentsById = new Map(comments.map((c) => [c.id, c]));

  // Reacciones (v1.6): En revisión, Aprobada o Publicada — la base aplica la misma regla. Se agrupan por comentario.
  const reactionsOpen = ["in_review", "approved", "published"].includes(effectiveStatus?.key ?? "");
  const reactionsByComment = new Map<string, CommentReaction[]>();
  for (const reaction of reactions) {
    const list = reactionsByComment.get(reaction.commentId) ?? [];
    list.push(reaction);
    reactionsByComment.set(reaction.commentId, list);
  }
  // Nombres conocidos para el detalle de quién reaccionó (autores del hilo + mencionables). Sin emails.
  const namesById = new Map<string, string>();
  for (const c of comments) if (c.authorId) namesById.set(c.authorId, c.authorName);
  for (const m of members ?? []) namesById.set(m.id, m.fullName);

  async function handleToggleReaction(commentId: string, emoji: CommentReactionEmoji) {
    const error = await toggleReaction(commentId, emoji);
    if (error) toast.error("No se pudo actualizar la reacción", error);
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending || !commentsOpen) return;
    setSending(true);
    try {
      // "En respuesta a": se guarda solo si la base lo admite (20261014000001); si no, se publica como antes.
      const result = await add(body, activeMentionIds(body, draftMentions), draftRequestId.current, replyTo?.id ?? null);
      if (result.error || !result.comment) {
        toast.error("No se pudo publicar el comentario", result.error ?? "Respuesta inesperada del servidor.");
        return;
      }
      setDraft("");
      setDraftMentions([]);
      setReplyTo(null);
      draftRequestId.current = crypto.randomUUID();
    } catch {
      toast.error("No se pudo publicar el comentario", "No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  function startEdit(comment: PublicationComment) {
    setEditingId(comment.id);
    setEditText(comment.body);
    // Menciones previas: se reconstruyen por nombre si el usuario sigue siendo mencionable.
    setEditMentions(
      (members ?? [])
        .filter((m) => comment.mentionIds.includes(m.id))
        .map((m) => ({ id: m.id, name: m.fullName }))
    );
    loadMembers();
  }

  async function handleSaveEdit(comment: PublicationComment) {
    const body = editText.trim();
    if (!body || savingEdit) return;
    setSavingEdit(true);
    try {
      // Menciones que no se pudieron reconstruir (p. ej. lista sin cargar) se conservan si su id ya estaba.
      const kept = comment.mentionIds.filter((id) => !editMentions.some((m) => m.id === id));
      const mentionIds = [...new Set([...activeMentionIds(body, editMentions), ...kept])];
      const result = await edit(comment.id, body, mentionIds);
      if (result.error) {
        toast.error("No se pudo editar el comentario", result.error);
        return;
      }
      setEditingId(null);
    } catch {
      toast.error("No se pudo editar el comentario", "No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await remove(deleteTarget.id);
      if (result.error) {
        toast.error("No se pudo eliminar el comentario", result.error);
        return;
      }
      setDeleteTarget(null);
    } catch {
      toast.error("No se pudo eliminar el comentario", "No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setDeleting(false);
    }
  }

  const liveLabel = loadState === "ready" ? LIVE_LABELS[liveState] : null;

  return (
    <section
      aria-labelledby={`comments-${publicationId}`}
      className={cn("flex flex-col gap-3", !embedded && "border-t border-border pt-4")}
    >
      {/* En su pestaña (md+): encabezado + editor quedan fijos arriba del scroll del panel, así el editor siempre
          está a mano mientras se recorre una conversación larga (el historial va del más reciente al más antiguo,
          justo debajo). -mt/pt compensan el padding del panel; -top-5 porque el límite del sticky es el content
          box del scroll (sin su padding): con top-0 bajaría 20px y taparía el contenido siguiente. */}
      <div
        className={cn(
          "flex flex-col gap-3",
          embedded && "bg-white md:sticky md:-top-5 md:z-[5] md:-mt-5 md:border-b md:border-border md:pt-5 md:pb-3"
        )}
      >
      <div className="flex items-center justify-between gap-2">
        <h3 id={`comments-${publicationId}`} className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="size-4" />
          Comentarios
          {loadState === "ready" && visibleCount > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({visibleCount})</span>
          )}
        </h3>
        {liveLabel && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span
              className={cn("size-1.5 rounded-full", liveState === "live" ? "bg-emerald-500" : "animate-pulse bg-amber-500")}
            />
            {liveLabel}
          </span>
        )}
      </div>

      {loadState !== "unavailable" &&
        (commentsOpen ? (
            <div className="flex flex-col gap-2">
              {replyTo && (
                <div className="flex items-start gap-2 rounded-lg border-l-2 border-[#AAB3C0] bg-[#F6F7F9] py-1.5 pr-1 pl-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => scrollToComment(replyTo.id)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left focus-visible:outline-none focus-visible:underline"
                    aria-label={`Ver el comentario de ${replyTo.authorName}`}
                  >
                    <span className="flex max-w-full items-center gap-1 font-medium text-foreground">
                      <Reply className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        Respondiendo a {replyTo.authorName}
                        {/* Sin 20261014000001 la referencia no se guarda: se aclara para no simular persistencia. */}
                        {!repliesSupported && <span className="font-normal text-muted-foreground"> · se publicará como mención</span>}
                      </span>
                    </span>
                    {replyTo.excerpt && <span className="w-full truncate text-muted-foreground">{replyTo.excerpt}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    aria-label="Quitar la referencia (el texto escrito se conserva)"
                    title="Quitar la referencia"
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <MentionTextarea
                value={draft}
                onChange={setDraft}
                mentions={draftMentions}
                onMentionsChange={setDraftMentions}
                members={members}
                onNeedMembers={loadMembers}
                onSubmitShortcut={handleSend}
                disabled={sending || loadState !== "ready"}
                placeholder="Escribí un comentario. Usá @ para mencionar."
                ariaLabel="Nuevo comentario"
                textareaRef={draftRef}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <AtSign className="size-3" />
                  Mencioná a alguien para avisarle
                  {draft.length > MAX_COMMENT_LENGTH * 0.9 && ` · ${draft.length}/${MAX_COMMENT_LENGTH}`}
                </span>
                <Button size="sm" type="button" onClick={handleSend} disabled={sending || !draft.trim() || loadState !== "ready"}>
                  {sending ? "Publicando..." : "Comentar"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
              Los comentarios se habilitan cuando la publicación está En revisión
              {effectiveStatus ? ` (ahora: ${effectiveStatus.label})` : ""}. El historial queda visible.
            </p>
          ))}
      </div>

      {loadState === "unavailable" ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Los comentarios todavía no están disponibles. {loadError}
        </p>
      ) : (
        <>
          {loadState === "loading" && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Cargando comentarios...
            </p>
          )}

          {loadState === "error" && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <span>No se pudieron cargar los comentarios. {loadError}</span>
              <Button size="sm" variant="outline" type="button" className="gap-1" onClick={() => void reload()}>
                <RefreshCcw className="size-3.5" />
                Reintentar
              </Button>
            </div>
          )}

          {loadState === "ready" && comments.length === 0 && (
            <p className="text-xs text-muted-foreground">Todavía no hay comentarios.</p>
          )}

          {/* Una sola lista cronológica, misma alineación para todos (sin burbujas ni hilos). */}
          <ol className="flex flex-col gap-5">
            {comments.map((comment) => {
              const isOwn = Boolean(currentUserId && comment.authorId === currentUserId);
              const isDeleted = comment.deletedAt !== null;
              const canModify = isOwn && !isDeleted && commentsOpen;
              // Responder: solo donde se puede escribir (la base acepta comentarios únicamente En revisión) y si el
              // autor es mencionable (miembro activo del cliente; la lista se carga al abrir la conversación).
              const canReply =
                !isOwn &&
                !isDeleted &&
                commentsOpen &&
                Boolean(currentUserId && comment.authorId) &&
                Boolean(members?.some((m) => m.id === comment.authorId));
              const mentionsMe = Boolean(currentUserId && comment.mentionIds.includes(currentUserId));
              const isEditing = editingId === comment.id;
              const commentReactions = reactionsByComment.get(comment.id) ?? [];
              const canReact = reactionsOpen && Boolean(currentUserId);
              const showReactions = reactionsSupported && (commentReactions.length > 0 || canReact);

              // Eliminado: una línea secundaria, sin superficie ni acciones (auditoría y permisos sin cambios).
              if (isDeleted) {
                return (
                  <li
                    key={comment.id}
                    id={`comment-${comment.id}`}
                    className="flex items-center gap-2 pl-11 text-xs text-muted-foreground"
                  >
                    <Trash2 className="size-3 shrink-0" aria-hidden />
                    <span className="italic">Comentario eliminado</span>
                    <span aria-hidden>·</span>
                    <time dateTime={comment.createdAt} className="shrink-0">{formatCommentDate(comment.createdAt)}</time>
                  </li>
                );
              }

              return (
                <li key={comment.id} id={`comment-${comment.id}`} className="flex gap-3">
                  <UserAvatar fullName={comment.authorName} email={null} avatarUrl={comment.authorAvatarUrl} size={32} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="max-w-full truncate text-sm font-semibold text-foreground">{comment.authorName}</span>
                      <span className="rounded-full border border-border bg-white px-1.5 text-[10px] leading-4 font-medium text-muted-foreground">
                        {comment.authorRole === "client" ? "Cliente" : "Agencia"}
                      </span>
                      <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">
                        {formatCommentDate(comment.createdAt)}
                      </time>
                      {comment.editedAt && (
                        <span className="text-xs text-muted-foreground" title={`Editado ${formatCommentDate(comment.editedAt)}`}>
                          · editado
                        </span>
                      )}
                      {mentionsMe && (
                        <span className="rounded-full bg-[#EEF3FA] px-1.5 text-[10px] leading-4 font-medium text-[#24467A]">
                          Te mencionó
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <MentionTextarea
                          value={editText}
                          onChange={setEditText}
                          mentions={editMentions}
                          onMentionsChange={setEditMentions}
                          members={members}
                          onNeedMembers={loadMembers}
                          onSubmitShortcut={() => void handleSaveEdit(comment)}
                          disabled={savingEdit}
                          autoFocus
                          ariaLabel="Editar comentario"
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" type="button" onClick={() => setEditingId(null)} disabled={savingEdit}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => void handleSaveEdit(comment)}
                            disabled={savingEdit || !editText.trim()}
                          >
                            {savingEdit ? "Guardando..." : "Guardar"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {comment.replyToCommentId && (
                          <ReplyReference original={commentsById.get(comment.replyToCommentId)} onGo={scrollToComment} />
                        )}
                        <div
                          className={cn(
                            "rounded-xl border border-[#ECEEF1] bg-[#F7F8FA] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground transition-colors [overflow-wrap:anywhere]",
                            highlightId === comment.id && "border-[#AAB3C0] bg-[#EEF1F5]"
                          )}
                        >
                          {renderBody(comment.body, knownNames)}
                        </div>
                      </div>
                    )}

                    {/* Una sola fila bajo el mensaje: reacciones a la izquierda, acciones a la derecha (si hay espacio; en
                        mobile envuelve a dos líneas). Solo se renderiza lo que el usuario puede ver o hacer. */}
                    {!isEditing && (showReactions || canReply || canModify) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-1">
                        {showReactions && (
                          <ReactionsBar
                            reactions={commentReactions}
                            currentUserId={currentUserId}
                            namesById={namesById}
                            canReact={canReact}
                            onToggle={(emoji) => void handleToggleReaction(comment.id, emoji)}
                          />
                        )}
                        {(canReply || canModify) && (
                          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                            {canReply && (
                              <button
                                type="button"
                                onClick={() => void handleReply(comment)}
                                disabled={sending || loadState !== "ready"}
                                aria-label={`Responder a ${comment.authorName}`}
                                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 pointer-coarse:min-h-8"
                              >
                                <Reply className="size-3.5" />
                                Responder
                              </button>
                            )}
                            {canModify && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(comment)}
                                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-8"
                                >
                                  <Pencil className="size-3.5" />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(comment)}
                                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive pointer-coarse:min-h-8"
                                >
                                  <Trash2 className="size-3.5" />
                                  Eliminar
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este comentario?</AlertDialogTitle>
            <AlertDialogDescription>
              Va a quedar como &quot;Comentario eliminado&quot; en el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleConfirmDelete}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** "En respuesta a …" encima de una respuesta publicada: lleva al original y lo resalta. */
function ReplyReference({ original, onGo }: { original: PublicationComment | undefined; onGo: (commentId: string) => void }) {
  if (!original || original.deletedAt !== null) {
    return (
      <span className="flex items-center gap-1 pl-1 text-xs text-muted-foreground italic">
        <CornerUpLeft className="size-3 shrink-0" aria-hidden />
        Comentario original eliminado
      </span>
    );
  }
  const excerpt = original.body.replace(/\s+/g, " ").trim();
  return (
    <button
      type="button"
      onClick={() => onGo(original.id)}
      className="flex max-w-full min-w-0 items-center gap-1 self-start rounded-md pl-1 pr-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      aria-label={`Ver el comentario original de ${original.authorName}`}
    >
      <CornerUpLeft className="size-3 shrink-0" aria-hidden />
      <span className="shrink-0">En respuesta a</span>
      <span className="shrink-0 font-medium text-foreground">{original.authorName}</span>
      {excerpt && <span className="min-w-0 truncate">· {excerpt}</span>}
    </button>
  );
}

/**
 * Reacciones de un comentario (v1.6): chips agrupados por emoji (las propias, con un fondo suave) y, donde se puede
 * reaccionar, un botón discreto con los seis emojis. Tocar un chip agrega o quita la reacción propia.
 */
function ReactionsBar({
  reactions,
  currentUserId,
  namesById,
  canReact,
  onToggle,
}: {
  reactions: CommentReaction[];
  currentUserId: string | null;
  namesById: Map<string, string>;
  canReact: boolean;
  onToggle: (emoji: CommentReactionEmoji) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const groups = COMMENT_REACTION_EMOJIS.map((emoji) => {
    const users = reactions.filter((r) => r.emoji === emoji).map((r) => r.userId);
    return { emoji, count: users.length, mine: Boolean(currentUserId && users.includes(currentUserId)), users };
  }).filter((g) => g.count > 0);
  if (groups.length === 0 && !canReact) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {groups.map((group) => {
        const names = group.users.map((id) => (id === currentUserId ? "Vos" : namesById.get(id))).filter(Boolean);
        const label = `${group.emoji} ${group.count}${names.length > 0 ? ` · ${names.join(", ")}` : ""}`;
        return (
          <button
            key={group.emoji}
            type="button"
            disabled={!canReact}
            onClick={() => onToggle(group.emoji)}
            title={label}
            aria-label={`${group.mine ? "Quitar" : "Agregar"} ${group.emoji} (${group.count})`}
            aria-pressed={group.mine}
            className={cn(
              "flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors disabled:cursor-default pointer-coarse:h-8",
              group.mine
                ? "border-[#C9D6EA] bg-[#EEF3FA] font-medium text-[#24467A]"
                : "border-[#E5E7EB] bg-white text-muted-foreground enabled:hover:border-[#C9D6EA]"
            )}
          >
            <span className="text-sm leading-none">{group.emoji}</span>
            {group.count}
          </button>
        );
      })}
      {canReact && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label="Agregar reacción"
                title="Agregar reacción"
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground pointer-coarse:size-8"
              />
            }
          >
            <SmilePlus className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto flex-row gap-0.5 p-1">
            {COMMENT_REACTION_EMOJIS.map((emoji) => {
              const mine = groups.some((g) => g.emoji === emoji && g.mine);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    onToggle(emoji);
                  }}
                  aria-label={`${mine ? "Quitar" : "Agregar"} ${emoji}`}
                  aria-pressed={mine}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-lg leading-none transition-colors hover:bg-muted",
                    mine && "bg-[#EEF3FA]"
                  )}
                >
                  {emoji}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
