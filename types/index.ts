export type CalendarStatus = "draft" | "active" | "archived";

export type UserRole = "super_admin" | "account_manager" | "client";

/** Estado de acceso derivado de Supabase Auth (no se guarda en DB). */
export type UserAccessStatus = "active" | "invited" | "disabled";

export interface ClientUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  clientId: string | null;
  createdAt: string;
  /** Solo lo resuelve un Super Admin (requiere la Auth Admin API); ausente si no se pudo o no corresponde. */
  accessStatus?: UserAccessStatus;
}

/** Integrante con acceso a un cliente puntual (header del Planner) — Super Admin + Account Managers
 * asignados + Client Users de ese cliente. Deliberadamente liviano (sin accessStatus/assignedClients):
 * es solo para mostrar avatar+nombre+rol, no para administrar usuarios (eso ya lo cubre TeamMember). */
export interface ClientMember {
  id: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: UserRole;
}

export interface TeamMember {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: "super_admin" | "account_manager";
  assignedClients: { id: string; name: string }[];
  active: boolean;
  accessStatus: UserAccessStatus;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  color: string;
  active: boolean;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
}

export interface Calendar {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description: string | null;
  status: CalendarStatus;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
}

export interface Platform {
  id: string;
  key: string;
  name: string;
  color: string;
  requiresAccountType: boolean;
}

export interface AccountType {
  id: string;
  key: string;
  name: string;
}

export interface ClientAccount {
  id: string;
  clientId: string;
  platformId: string;
  /** Handle sin "@": identificador principal y obligatorio de la cuenta (el "@" es solo presentación). */
  handle: string;
  /** Nombre opcional y secundario. */
  name: string | null;
  url: string | null;
  accountTypeId: string | null;
  active: boolean;
  sortOrder: number;
}

export interface PublicationDestination {
  clientAccountId: string;
}

export interface Campaign {
  id: string;
  clientId: string;
  name: string;
  archivedAt: string | null;
}

export interface ContentType {
  id: string;
  key: string;
  label: string;
  order: number;
}

export interface Status {
  id: string;
  key: string;
  label: string;
  color: string;
  order: number;
}

export type AssetType = "image" | "video" | "pdf" | "document" | "other";

export interface PublicationAsset {
  id: string;
  publicationId: string;
  type: AssetType;
  filename: string;
  mimeType: string | null;
  driveFileId: string | null;
  driveFileUrl: string | null;
  thumbnailUrl: string | null;
  fileSize: number | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface Publication {
  id: string;
  calendarId: string;
  clientId: string;
  title: string;
  publicationDate: string;
  publicationTime: string | null;
  campaignId: string | null;
  contentTypeId: string;
  statusId: string;
  copy: string;
  /** CTA y URL: columnas conservadas (datos históricos); v1.6 ya no las muestra ni las edita. */
  cta: string | null;
  externalUrl: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  /** v1.6 archivado: fecha en que se archivó (null = activa). Las listas del Planner y del Escritorio no incluyen
   * archivadas; solo el panel "Publicaciones archivadas" (staff) las muestra. */
  archivedAt: string | null;
  /** v1.6: link a la tarjeta de Trello (opcional). */
  trelloUrl: string | null;
  destinations: PublicationDestination[];
  assets: PublicationAsset[];
  /** publications.updated_at tal cual lo devuelve PostgREST: versión para el bloqueo optimista del editor (v1.6). */
  updatedAt: string;
}

/** Comentario de una publicación (v1.6). Autor como snapshot: un Client User no puede leer profiles del staff. */
export interface PublicationComment {
  id: string;
  publicationId: string;
  authorId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: string;
  /** Vacío cuando está eliminado (el texto original solo queda en la auditoría interna). */
  body: string;
  requestId: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  mentionIds: string[];
  /** v1.6 respuestas: comentario (de la misma publicación) al que responde; null si no responde a ninguno. */
  replyToCommentId: string | null;
}

/** v1.6: los seis emojis de reacción aprobados (la base los valida con un CHECK). */
export const COMMENT_REACTION_EMOJIS = ["👍", "❤️", "👏", "🎉", "😂", "👀"] as const;
export type CommentReactionEmoji = (typeof COMMENT_REACTION_EMOJIS)[number];

/** Reacción activa de un usuario a un comentario. */
export interface CommentReaction {
  commentId: string;
  userId: string;
  emoji: CommentReactionEmoji;
}

export type NotificationType = "comment" | "mention" | "review_requested" | "approved_by_client" | "approved_by_agency";

/** Notificación interna (v1.6) — siempre del usuario actual (RLS recipient_id = auth.uid()). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  /** Cliente de la publicación (filtro por espacio del dashboard de Inicio). */
  clientId: string | null;
  publicationId: string | null;
  commentId: string | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
  publicationTitle: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Usuario mencionable con @ (v1.6): activo y autorizado para el cliente. Sin email a propósito. */
export interface MentionableMember {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
}
