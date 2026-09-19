import { APP_VERSION } from "@/lib/version";
import type { UserRole } from "@/types";

export interface ChangelogEntry {
  text: string;
  /** Roles que pueden ver esta novedad puntual. */
  roles: UserRole[];
}

export interface ChangelogRelease {
  version: string;
  date: string; // yyyy-MM-dd
  entries: ChangelogEntry[];
}

/**
 * Historial de versiones, mas reciente primero. Agregar una version nueva es
 * solamente sumar un elemento acá — /changelog y el banner de novedades no
 * requieren cambios.
 */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "1.2",
    date: "2026-09-18",
    entries: [
      {
        text: "Una experiencia más ágil para planificar y gestionar contenidos.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Mover publicaciones más fácil: ahora podés arrastrar publicaciones de un día a otro directamente desde la vista semanal.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Acciones rápidas: editá, duplicá, cambiá el estado o eliminá una publicación directamente desde el calendario.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Mejor edición de copies: sumamos emojis, negritas, listas, contador de caracteres y copia rápida al portapapeles.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Campañas: ahora podés organizar y filtrar publicaciones utilizando campañas reutilizables.",
        roles: ["super_admin", "account_manager"],
      },
      {
        // Variante de consulta: el Client User solo filtra (Planner read-only).
        text: "Campañas: ahora podés filtrar las publicaciones por campaña para encontrar el contenido más fácilmente.",
        roles: ["client"],
      },
      {
        text: "Exportar calendario: descargá en CSV el calendario que estás viendo, respetando el período, los calendarios seleccionados y los filtros activos.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Mejor gestión de accesos: ahora podés identificar usuarios activos, invitados o desactivados y reenviar invitaciones pendientes.",
        roles: ["super_admin"],
      },
      {
        text: "Navegación más cómoda: el menú lateral ahora puede expandirse al pasar el mouse y mantenerse fijo si preferís trabajar con la navegación abierta.",
        roles: ["super_admin", "account_manager"],
      },
      {
        // El Client User también recibe estos avisos (copiar copy, perfil y contraseña).
        text: "Notificaciones más claras: renovamos las notificaciones para distinguir rápidamente acciones exitosas, errores e información.",
        roles: ["super_admin", "account_manager", "client"],
      },
    ],
  },
];

/** Historial completo visible para un rol (para /changelog). */
export function getChangelogForRole(role: UserRole): ChangelogRelease[] {
  return CHANGELOG.map((release) => ({
    ...release,
    entries: release.entries.filter((entry) => entry.roles.includes(role)),
  })).filter((release) => release.entries.length > 0);
}

/**
 * Novedades de la version ACTUAL (APP_VERSION) visibles para un rol —
 * exclusivamente para el banner "Nuevas actualizaciones". Nunca versiones
 * anteriores: un usuario con last_seen_version=null solo debe ver esto,
 * jamás el historico retroactivo completo.
 */
export function getCurrentReleaseForRole(role: UserRole): ChangelogRelease | null {
  return getChangelogForRole(role).find((release) => release.version === APP_VERSION) ?? null;
}
