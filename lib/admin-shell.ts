/**
 * v1.6 — Acciones de cuenta (campanita + avatar) del layout de /admin: en desktop flotan en el extremo superior
 * derecho del contenido (alineadas con la fila de título de cada pantalla, ~74px de ancho a 24px del borde) y
 * scrollean con él. Las filas de encabezado que tienen controles a la derecha reservan ese espacio con estas
 * clases, así nada queda debajo de las acciones (sin una barra extra que gaste alto).
 *
 * El layout marca su contenedor con `data-admin-shell`; los componentes compartidos con el portal del cliente
 * (CalendarHeader, historial de notificaciones) usan las variantes `in-data-[admin-shell]` para reservar el
 * espacio SOLO dentro de /admin.
 */

/** Fila de encabezado dentro de un contenedor con p-6 (pantallas propias de /admin). */
export const ADMIN_ACTIONS_RESERVE = "md:pr-24";

/** Igual que ADMIN_ACTIONS_RESERVE, para componentes compartidos con el portal del cliente. */
export const ADMIN_ACTIONS_RESERVE_SHARED = "in-data-[admin-shell]:md:pr-24";

/**
 * Fila de encabezado de borde a borde con su propio md:px-6 (CalendarHeader), compartida con el portal. Solo se usa
 * en las pantallas del Planner, donde las acciones van compactas (ver isPlannerPath).
 */
export const ADMIN_ACTIONS_RESERVE_FULL_BLEED_SHARED =
  "in-data-[admin-shell]:md:pr-[96px] in-data-[admin-shell]:md:pointer-coarse:pr-[124px]";

/**
 * Pantallas del Planner (calendario global y Planner de cada cliente): ahí las acciones de cuenta usan la escala
 * compacta del encabezado del Planner (campanita 28 px, avatar 32 px, top 15 px) para compartir eje con sus controles superiores.
 */
export function isPlannerPath(pathname: string): boolean {
  return pathname === "/admin/publications" || /^\/admin\/clients\/[^/]+\/planner$/.test(pathname);
}
