import type { CSSProperties } from "react";
import { getReadableTextColor } from "@/lib/color-contrast";

/**
 * v1.6 — Superficies y colores del calendario (calendario global, Planner de cada cliente y portal Client User).
 *
 * Grilla continua y minimalista: días hábiles blancos, sábado y domingo con UN único tono muy tenue, días fuera del
 * mes en gris neutro (con prioridad sobre el fin de semana), líneas casi imperceptibles y un contorno gris sutil con
 * esquinas redondeadas. Sin franja de color alrededor del calendario ni fondo de color en el encabezado de días.
 *
 * Lo único que varía por contexto, expuesto como variables CSS en el contenedor de CalendarScreen:
 *   --cal-weekend    tono tenue de sábado y domingo (celeste en el global; derivado del color del cliente)
 *   --cal-accent / --cal-accent-soft / --cal-accent-ink  identidad del encabezado: línea superior (color principal),
 *                    fondo suave (botón "+", pestaña activa) y su texto/ícono
 *   --cal-accent-fg  ícono/texto sobre el color principal sólido (blanco u oscuro, el de mejor contraste)
 * Dentro de la grilla el color del cliente solo llega al fin de semana.
 */

export interface CalendarTheme {
  weekend: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
}

/** Calendario global: celeste. */
export const GLOBAL_CALENDAR_THEME: CalendarTheme = {
  weekend: "#F3F8FB",
  accent: "#29A9DF",
  accentSoft: "#BDE6F7",
  accentInk: "#0E4A66",
};

const SLATE = "#94A3B8";
const WHITE = "#FFFFFF";
const INK = "#0F172A";

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mezcla `a` hacia `b` en proporción `t` (0 = a, 1 = b). */
function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  return `#${a
    .map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Paleta del Planner de un cliente, derivada de su color principal. Color inválido → paleta global. */
export function calendarThemeFromColor(hex: string): CalendarTheme {
  const color = parseHex(hex);
  if (!color) return GLOBAL_CALENDAR_THEME;
  const white = parseHex(WHITE)!;
  // 30 % hacia el gris pizarra: baja la saturación de colores intensos antes de aclarar.
  const base = parseHex(mix(color, parseHex(SLATE)!, 0.3))!;
  return {
    // Sábado y domingo: un único tono muy tenue del color del cliente.
    weekend: mix(white, base, 0.06),
    // Acentos del encabezado: la línea superior es el color principal tal cual; fondo suave y tinta derivados.
    accent: mix(color, color, 0),
    accentSoft: mix(white, color, 0.3),
    accentInk: mix(color, parseHex(INK)!, 0.55),
  };
}

/** Variables CSS de la paleta, para el `style` del contenedor del calendario. */
export function calendarThemeStyle(theme: CalendarTheme): CSSProperties {
  return {
    "--cal-weekend": theme.weekend,
    "--cal-accent": theme.accent,
    "--cal-accent-soft": theme.accentSoft,
    "--cal-accent-ink": theme.accentInk,
    "--cal-accent-fg": getReadableTextColor(theme.accent),
  } as CSSProperties;
}

/** Fondo del área de trabajo: blanco (sin franja de color alrededor del calendario). */
export const CAL_WORKSPACE_BG = "bg-white";

/** Fondos de los días (clases: así el resaltado de arrastrar-y-soltar, también una clase, puede reemplazarlos). */
export const CAL_DAY_BG = "bg-white";
export const CAL_WEEKEND_BG = "bg-[var(--cal-weekend)]";
/** Días fuera del mes: gris neutro (tiene prioridad sobre el fin de semana). */
export const CAL_OUTSIDE_BG = "bg-[#F5F6F8]";

/** Encabezado de los días (LUN … DOM) y del día en la vista Día: fondo blanco, texto discreto. */
export const CAL_DAY_NAMES = "bg-white text-muted-foreground";

/** Línea superior del encabezado: color principal del contexto (cliente, o celeste en el calendario global). */
export const CAL_ACCENT_LINE = "bg-[var(--cal-accent)]";
/** Fondo suave de acento con su tinta (botón "+", pestaña activa de Calendario / Lista). */
export const CAL_ACCENT_SOFT = "bg-[var(--cal-accent-soft)] text-[var(--cal-accent-ink)]";

/** Color principal sólido con su ícono/texto de mejor contraste (botón "+" de cada día). */
export const CAL_ACCENT_SOLID = "bg-[var(--cal-accent)] text-[var(--cal-accent-fg)]";

/**
 * Botón "+" de cada día (Mes y Semana): mismo lenguaje que el "+" del encabezado, en chico (26 px), sólido con el color
 * principal del contexto. Aparece con hover/focus del día; en pantallas táctiles queda siempre visible.
 */
export const CAL_DAY_ADD_BUTTON =
  "flex size-[26px] items-center justify-center rounded-full bg-[var(--cal-accent)] text-[var(--cal-accent-fg)] shadow-xs opacity-0 transition-[opacity,filter] duration-150 hover:brightness-95 group-hover/day:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:opacity-100";

/** Encabezado y barras del calendario: blanco puro (bg-background es un gris muy claro, #F7F7F7). */
export const CAL_HEADER_BG = "bg-white";

/** Líneas divisorias casi imperceptibles de la grilla. */
export const CAL_LINE_BORDER = "border-[#ECEEF1]";
export const CAL_LINE_DIVIDE = "divide-[#ECEEF1]";

/**
 * Contorno de la grilla (Mes y Semana), del tablero de Día y de Lista: borde gris sutil y esquinas redondeadas, sin
 * sombras. `overflow-clip` (no `hidden`) recorta las esquinas sin volverlo un contenedor de scroll, así Semana y
 * Lista conservan su alto.
 */
export const CAL_GRID_FRAME = "overflow-clip rounded-xl border border-[#ECEEF1]";
