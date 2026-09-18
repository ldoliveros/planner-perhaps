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
    date: "2026-09-17",
    entries: [
      {
        text: "Sumamos esta sección de novedades: acá vas a poder ver qué cambió en cada actualización de Perhaps Planner.",
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
