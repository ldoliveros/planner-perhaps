/**
 * Estados en los que se puede comentar (agregar, responder, editar o eliminar los propios): todos los previos a
 * Publicado. Publicada y Descartada: historial visible en solo lectura. La base aplica la misma regla en cada RPC
 * (`public.comments_open_for_status`, migración 20261126000001); esto solo decide qué ofrece la interfaz.
 */
export const COMMENT_OPEN_STATUS_KEYS = ["draft", "in_review", "approved"] as const;

/** Reacciones: donde se puede comentar, y también Publicada (misma regla que `set_comment_reaction`). */
export const REACTION_OPEN_STATUS_KEYS = [...COMMENT_OPEN_STATUS_KEYS, "published"] as const;

export function commentsOpenForStatus(statusKey: string | null | undefined): boolean {
  return (COMMENT_OPEN_STATUS_KEYS as readonly string[]).includes(statusKey ?? "");
}

export function reactionsOpenForStatus(statusKey: string | null | undefined): boolean {
  return (REACTION_OPEN_STATUS_KEYS as readonly string[]).includes(statusKey ?? "");
}
