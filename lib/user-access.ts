import type { UserAccessStatus } from "@/types";

export const ACCESS_STATUS_LABELS: Record<UserAccessStatus, string> = {
  active: "Activo",
  invited: "Invitado",
  disabled: "Desactivado",
};

/**
 * Deriva el estado de acceso de un usuario de Supabase Auth (no se guarda en DB):
 * - Desactivado: `banned_until` en el futuro (misma lógica que ban/unban del Equipo).
 * - Invitado: existe en Auth pero nunca confirmó su email (no aceptó la invitación).
 * - Activo: el resto.
 * Un usuario baneado se muestra Desactivado aunque nunca haya confirmado.
 */
export function deriveUserAccessStatus(user: {
  banned_until?: string | null;
  email_confirmed_at?: string | null;
}): UserAccessStatus {
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) return "disabled";
  if (!user.email_confirmed_at) return "invited";
  return "active";
}
