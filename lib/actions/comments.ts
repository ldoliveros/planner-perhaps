"use server";

import { createClient } from "@/lib/supabase/server";
import { isMissingV16Object, V16_PENDING_MESSAGE } from "@/lib/editorial-transitions";
import { COMMENT_REACTION_EMOJIS, type CommentReaction, type CommentReactionEmoji, type MentionableMember, type PublicationComment } from "@/types";

/**
 * Comentarios y menciones de v1.6 (Fase 3). Los permisos NO dependen de React:
 *   * Lectura: RLS `publication_comments_select` (can_view_client) — un usuario solo recibe comentarios de
 *     clientes que puede ver.
 *   * Escritura: RPCs security definer (add/edit/delete_publication_comment) que validan autor, cliente,
 *     estado En revisión, largo y menciones. No hay policies de INSERT/UPDATE/DELETE: un INSERT directo
 *     falla aunque se salteé la UI.
 * La UI solo oculta acciones que la base igual rechazaría.
 *
 * Mientras supabase/migrations/20261008000001_v16_collab_core.sql no esté aplicada, cada acción devuelve
 * `unavailable: true` + un mensaje explícito — nunca un éxito simulado. Las tablas/RPCs nuevas no están en
 * database.types.ts todavía: se castea el cliente completo (mismo criterio que lib/actions/editorial-flow.ts).
 */

interface PostgrestLikeError {
  code?: string;
  message: string;
}

interface CommentRow {
  id: string;
  publication_id: string;
  author_id: string | null;
  author_name: string;
  author_avatar_url: string | null;
  author_role: string;
  body: string;
  request_id: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Solo con 20261014000001 aplicada. */
  reply_to_comment_id?: string | null;
}

interface ReactionRow {
  comment_id: string;
  user_id: string;
  emoji: string;
}

interface MentionRow {
  comment_id: string;
  user_id: string;
}

interface MemberRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

type Result<T> = Promise<{ data: T | null; error: PostgrestLikeError | null }>;

interface UntypedQuery<T> extends PromiseLike<{ data: T | null; error: PostgrestLikeError | null }> {
  eq(column: string, value: string): UntypedQuery<T>;
  in(column: string, values: string[]): UntypedQuery<T>;
  order(column: string, opts: { ascending: boolean }): UntypedQuery<T>;
  maybeSingle(): Result<T extends (infer R)[] ? R : T>;
}

interface V16Client {
  from(table: "publication_comments"): { select(columns: string): UntypedQuery<CommentRow[]> };
  from(table: "publication_comment_mentions"): { select(columns: string): UntypedQuery<MentionRow[]> };
  from(table: "publication_comment_reactions"): { select(columns: string): UntypedQuery<ReactionRow[]> };
  rpc(
    fn: "add_publication_comment",
    args: { p_publication_id: string; p_body: string; p_mentions: string[]; p_request_id: string; p_reply_to?: string }
  ): Result<CommentRow>;
  rpc(fn: "set_comment_reaction", args: { p_comment_id: string; p_emoji: string; p_active: boolean }): Result<boolean>;
  rpc(fn: "edit_publication_comment", args: { p_comment_id: string; p_body: string; p_mentions: string[] }): Result<CommentRow>;
  rpc(fn: "delete_publication_comment", args: { p_comment_id: string }): Result<CommentRow>;
  rpc(fn: "list_mentionable_members", args: { p_client_id: string }): Result<MemberRow[]>;
  rpc(fn: "list_unread_publication_comments", args: { p_publication_id: string }): Result<{ comment_id: string }[]>;
  rpc(fn: "mark_publication_comments_read", args: { p_publication_id: string; p_comment_ids: string[] }): Result<number>;
}

const BASE_COMMENT_COLUMNS =
  "id, publication_id, author_id, author_name, author_avatar_url, author_role, body, request_id, edited_at, deleted_at, created_at, updated_at";
/** Con 20261014000001 (respuestas persistentes). Sin la columna, las consultas vuelven a las columnas base. */
const COMMENT_COLUMNS = `${BASE_COMMENT_COLUMNS}, reply_to_comment_id`;

/** Postgres: columna inexistente (42703) / tabla o función inexistente (42P01, 42883) / PostgREST sin la función
 * con esa firma (PGRST202) o sin la columna en su caché (PGRST204): la migración todavía no está aplicada. */
function isMissingObject(code: string | undefined): boolean {
  return code === "42703" || code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST204";
}

async function v16Client() {
  const supabase = await createClient();
  return { supabase, db: supabase as unknown as V16Client };
}

function mapComment(row: CommentRow, mentionIds: string[]): PublicationComment {
  return {
    id: row.id,
    publicationId: row.publication_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    authorRole: row.author_role,
    body: row.body,
    requestId: row.request_id,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mentionIds,
    replyToCommentId: row.reply_to_comment_id ?? null,
  };
}

async function mentionsFor(db: V16Client, commentIds: string[]): Promise<Map<string, string[]>> {
  const byComment = new Map<string, string[]>();
  if (commentIds.length === 0) return byComment;
  const { data } = await db.from("publication_comment_mentions").select("comment_id, user_id").in("comment_id", commentIds);
  for (const row of data ?? []) {
    const list = byComment.get(row.comment_id) ?? [];
    list.push(row.user_id);
    byComment.set(row.comment_id, list);
  }
  return byComment;
}

function failure(error: PostgrestLikeError): { error: string; unavailable: boolean } {
  if (isMissingV16Object(error.code)) return { error: V16_PENDING_MESSAGE, unavailable: true };
  return { error: error.message, unavailable: false };
}

export interface CommentsListResult {
  comments: PublicationComment[];
  /** 20261014000001 aplicada: se puede guardar y mostrar "en respuesta a". */
  repliesSupported: boolean;
  /** Usuario actual — la UI lo usa solo para ofrecer Editar/Eliminar en los propios (la RPC lo revalida). */
  currentUserId: string | null;
  error: string | null;
  /** v1.6 todavía no instalada en la base (tabla/RPC inexistente). */
  unavailable: boolean;
}

/** Historial completo de una publicación, del más reciente al más antiguo. */
export async function listPublicationComments(publicationId: string): Promise<CommentsListResult> {
  const { supabase, db } = await v16Client();
  const query = (columns: string) =>
    db.from("publication_comments").select(columns).eq("publication_id", publicationId).order("created_at", { ascending: false });
  const [{ data: auth }, first] = await Promise.all([supabase.auth.getUser(), query(COMMENT_COLUMNS)]);
  const currentUserId = auth.user?.id ?? null;
  let { data, error } = first;
  let repliesSupported = true;
  if (error && isMissingObject(error.code)) {
    // Sin 20261014000001: historial con las columnas base (sin "en respuesta a").
    repliesSupported = false;
    ({ data, error } = await query(BASE_COMMENT_COLUMNS));
  }
  if (error) return { comments: [], repliesSupported: false, currentUserId, ...failure(error) };

  const rows = data ?? [];
  const mentions = await mentionsFor(db, rows.map((r) => r.id));
  return {
    comments: rows.map((r) => mapComment(r, mentions.get(r.id) ?? [])),
    repliesSupported,
    currentUserId,
    error: null,
    unavailable: false,
  };
}

/** Un comentario puntual (lo usa la UI al recibir un evento Realtime: el payload es solo una señal; los datos
 * se releen acá, bajo RLS, en vez de confiar en lo que llegó por el socket). null si no existe o no es visible. */
export async function getPublicationComment(commentId: string): Promise<PublicationComment | null> {
  const { db } = await v16Client();
  let { data, error } = await db.from("publication_comments").select(COMMENT_COLUMNS).eq("id", commentId).maybeSingle();
  if (error && isMissingObject(error.code)) {
    ({ data, error } = await db.from("publication_comments").select(BASE_COMMENT_COLUMNS).eq("id", commentId).maybeSingle());
  }
  if (error || !data) return null;
  const mentions = await mentionsFor(db, [data.id]);
  return mapComment(data, mentions.get(data.id) ?? []);
}

export interface CommentMutationResult {
  comment: PublicationComment | null;
  error: string | null;
  unavailable: boolean;
}

async function withMentions(db: V16Client, row: CommentRow | null): Promise<PublicationComment | null> {
  if (!row) return null;
  const mentions = await mentionsFor(db, [row.id]);
  return mapComment(row, mentions.get(row.id) ?? []);
}

/** Crear. `requestId` fijo por intento de envío: un reintento devuelve el mismo comentario (sin duplicar). */
export async function addPublicationComment(
  publicationId: string,
  body: string,
  mentionIds: string[],
  requestId: string,
  /** Solo con 20261014000001 aplicada (la UI lo manda únicamente si `repliesSupported`). */
  replyToCommentId?: string | null
): Promise<CommentMutationResult> {
  const { db } = await v16Client();
  const { data, error } = await db.rpc("add_publication_comment", {
    p_publication_id: publicationId,
    p_body: body,
    p_mentions: mentionIds,
    p_request_id: requestId,
    ...(replyToCommentId ? { p_reply_to: replyToCommentId } : {}),
  });
  if (error) return { comment: null, ...failure(error) };
  return { comment: await withMentions(db, data), error: null, unavailable: false };
}

export async function editPublicationComment(
  commentId: string,
  body: string,
  mentionIds: string[]
): Promise<CommentMutationResult> {
  const { db } = await v16Client();
  const { data, error } = await db.rpc("edit_publication_comment", {
    p_comment_id: commentId,
    p_body: body,
    p_mentions: mentionIds,
  });
  if (error) return { comment: null, ...failure(error) };
  return { comment: await withMentions(db, data), error: null, unavailable: false };
}

export async function deletePublicationComment(commentId: string): Promise<CommentMutationResult> {
  const { db } = await v16Client();
  const { data, error } = await db.rpc("delete_publication_comment", { p_comment_id: commentId });
  if (error) return { comment: null, ...failure(error) };
  return { comment: await withMentions(db, data), error: null, unavailable: false };
}

export interface MentionableResult {
  members: MentionableMember[];
  error: string | null;
  unavailable: boolean;
}

/** Usuarios mencionables del cliente: activos y autorizados (Super Admin solo si está asignado). Sin emails. */
export async function listMentionableMembers(clientId: string): Promise<MentionableResult> {
  const { db } = await v16Client();
  const { data, error } = await db.rpc("list_mentionable_members", { p_client_id: clientId });
  if (error) return { members: [], ...failure(error) };
  return {
    members: (data ?? []).map((m) => ({ id: m.user_id, fullName: m.full_name, avatarUrl: m.avatar_url, role: m.role })),
    error: null,
    unavailable: false,
  };
}

export interface UnreadCommentsResult {
  /** Comentarios pendientes del usuario actual (ajenos, no eliminados, posteriores a su incorporación, sin leer). */
  ids: string[];
  error: string | null;
  /** 20261013000001_v16_comment_reads.sql no aplicada: la pestaña se muestra sin contador. */
  unavailable: boolean;
}

/**
 * Comentarios no leídos (v1.6): lista COMPLETA calculada en la base (list_unread_publication_comments), con la
 * lectura propia de cada usuario (publication_comment_reads). No depende de las notificaciones ni de su flag.
 */
export async function listUnreadPublicationComments(publicationId: string): Promise<UnreadCommentsResult> {
  const { db } = await v16Client();
  const { data, error } = await db.rpc("list_unread_publication_comments", { p_publication_id: publicationId });
  if (error) return { ids: [], ...failure(error) };
  return { ids: (data ?? []).map((row) => row.comment_id), error: null, unavailable: false };
}

/** Deja constancia de lectura de los comentarios MOSTRADOS (ids explícitos; la RPC ignora propios/eliminados/ajenos). */
export async function markPublicationCommentsRead(
  publicationId: string,
  commentIds: string[]
): Promise<{ error: string | null; unavailable: boolean }> {
  if (commentIds.length === 0) return { error: null, unavailable: false };
  const { db } = await v16Client();
  const { error } = await db.rpc("mark_publication_comments_read", {
    p_publication_id: publicationId,
    p_comment_ids: commentIds.slice(0, 1000),
  });
  if (error) return failure(error);
  return { error: null, unavailable: false };
}

export interface ReactionsListResult {
  reactions: CommentReaction[];
  /** 20261014000002 aplicada (tabla de reacciones disponible). */
  supported: boolean;
  error: string | null;
}

/** Reacciones ACTIVAS de una publicación (RLS: mismo acceso que los comentarios). Sin la migración: no soportadas. */
export async function listCommentReactions(publicationId: string): Promise<ReactionsListResult> {
  const { db } = await v16Client();
  const { data, error } = await db
    .from("publication_comment_reactions")
    .select("comment_id, user_id, emoji")
    .eq("publication_id", publicationId)
    .eq("active", "true");
  if (error) {
    if (isMissingObject(error.code) || isMissingV16Object(error.code)) return { reactions: [], supported: false, error: null };
    return { reactions: [], supported: true, error: error.message };
  }
  return {
    reactions: (data ?? [])
      .filter((r) => (COMMENT_REACTION_EMOJIS as readonly string[]).includes(r.emoji))
      .map((r) => ({ commentId: r.comment_id, userId: r.user_id, emoji: r.emoji as CommentReactionEmoji })),
    supported: true,
    error: null,
  };
}

/** Agregar (`active = true`) o quitar la reacción PROPIA. Idempotente; la base valida estado, acceso y emoji. */
export async function setCommentReaction(
  commentId: string,
  emoji: CommentReactionEmoji,
  active: boolean
): Promise<{ error: string | null; unavailable: boolean }> {
  const { db } = await v16Client();
  const { error } = await db.rpc("set_comment_reaction", { p_comment_id: commentId, p_emoji: emoji, p_active: active });
  if (error) {
    if (isMissingObject(error.code)) return { error: V16_PENDING_MESSAGE, unavailable: true };
    return failure(error);
  }
  return { error: null, unavailable: false };
}
