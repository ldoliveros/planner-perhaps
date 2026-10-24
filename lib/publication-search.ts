/**
 * Búsqueda global de publicaciones por título (v1.6). Funciones puras: normalización del término, paginación y el
 * patrón que se envía a Supabase.
 *
 * Coincidencia parcial, sin distinguir mayúsculas ni acentos, sin extensiones nuevas en la base (no hay `unaccent`):
 * el término se convierte en una expresión regular POSIX que PostgREST evalúa con `imatch` (`~*`), donde cada vocal,
 * la "n" y la "c" aceptan sus variantes acentuadas en minúscula y mayúscula ("cancion" encuentra "Canción" y
 * viceversa). El resto de los caracteres se escapan: el usuario nunca escribe una regex.
 */

export const SEARCH_PAGE_SIZE = 25;
export const SEARCH_MAX_LENGTH = 100;

const ACCENT_CLASSES: Record<string, string> = {
  a: "aáàâäãAÁÀÂÄÃ",
  e: "eéèêëEÉÈÊË",
  i: "iíìîïIÍÌÎÏ",
  o: "oóòôöõOÓÒÔÖÕ",
  u: "uúùûüUÚÙÛÜ",
  n: "nñNÑ",
  c: "cçCÇ",
};

/** Letra base (sin acento, minúscula) de cada variante acentuada. */
const BASE_LETTER = new Map<string, string>();
for (const [base, variants] of Object.entries(ACCENT_CLASSES)) {
  for (const variant of variants) BASE_LETTER.set(variant, base);
}

/** Término tal como se busca y se muestra: sin espacios sobrantes y con un largo máximo. */
export function normalizeSearchQuery(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH);
}

/** Página pedida (1 si falta o es inválida). */
export function parseSearchPage(raw: string | string[] | undefined | null): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 1 ? value : 1;
}

/** Expresión regular (para `imatch`) que encuentra el término dentro del título, ignorando acentos y mayúsculas. */
export function titleSearchPattern(query: string): string {
  let pattern = "";
  for (const char of query) {
    const base = BASE_LETTER.get(char) ?? BASE_LETTER.get(char.toLowerCase());
    if (base) {
      pattern += `[${ACCENT_CLASSES[base]}]`;
    } else if (/[a-z]/i.test(char)) {
      pattern += `[${char.toLowerCase()}${char.toUpperCase()}]`;
    } else if (/[\p{L}\p{N} ]/u.test(char)) {
      pattern += char;
    } else {
      // Cualquier otro carácter (puntuación, símbolos) se busca literal.
      pattern += `\\${char}`;
    }
  }
  return pattern;
}

/** URL de resultados según el portal (staff o Client User): término, espacio (opcional, `?space=`) y página. */
export function searchResultsHref(
  base: "/admin/search" | "/client/search",
  query: string,
  options: { page?: number; space?: string | null } = {}
): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (options.space) params.set("space", options.space);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}
