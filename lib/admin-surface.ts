/**
 * v1.6 — Sistema visual de las pantallas administrativas (Escritorio, Clientes, ficha del cliente, Equipo, Mi perfil y
 * Novedades), alineado con el Planner: fondo blanco, superficies blancas, bordes suaves (#E8EAED), sin sombras,
 * esquinas redondeadas como la grilla del calendario y hover de filas muy tenue.
 *
 * `admin-surface` (globals.css) solo redefine variables (--background, --border, --input) dentro de la pantalla que
 * la usa: los componentes de siempre (Table, Badge, Button outline, Input…) toman el sistema nuevo sin duplicar
 * estilos, y no alcanza al calendario, a los modales/menús (se renderizan en portales fuera de ese árbol) ni al
 * portal Client User.
 */

/** Raíz de una pantalla administrativa: variables del sistema visual + fondo blanco. */
export const ADMIN_SURFACE = "admin-surface bg-white";

/** Solo las variables, sin fondo: para pantallas compartidas con el portal Client User (Mi perfil). */
export const ADMIN_SURFACE_VARS = "admin-surface";

/** Tarjeta / superficie: blanca, borde suave, sin sombra. */
export const ADMIN_CARD = "rounded-xl border border-border bg-card";

/** Contenedor de tabla: mismo borde y esquinas que ADMIN_CARD; recorta las filas. */
export const ADMIN_TABLE_FRAME = "overflow-hidden rounded-xl border border-border bg-card";

/** Título de pantalla y de sección (misma jerarquía en todas las pantallas). */
export const ADMIN_PAGE_TITLE = "text-xl font-semibold tracking-tight text-foreground";
export const ADMIN_SECTION_TITLE = "text-[15px] font-semibold text-foreground";

/** Hover de filas que no son <TableRow> (listas propias). */
export const ADMIN_ROW_HOVER = "transition-colors hover:bg-[#F8F9FA]";
