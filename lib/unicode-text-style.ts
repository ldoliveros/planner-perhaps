// Negrita Unicode (Mathematical Sans-Serif Bold): reemplaza A-Z/a-z/0-9 por su
// codepoint en el bloque Mathematical Alphanumeric Symbols. Es texto plano de
// verdad — cada resultado es un carácter Unicode real, no HTML ni Markdown.
// Solo cubre ASCII alfanumérico: el bloque no define formas con tilde/diéresis
// (á, é, ñ, ü, ¿, ¡...), así que esos caracteres NUNCA se tocan — inventar una
// combinación con acentos combinantes sería justo la conversión frágil que no
// queremos. Los codepoints están fuera del BMP (requieren surrogate pair en
// UTF-16); String.fromCodePoint/codePointAt ya lo manejan correctamente.

const UPPER_A = 0x41;
const UPPER_Z = 0x5a;
const LOWER_A = 0x61;
const LOWER_Z = 0x7a;
const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;

const BOLD_UPPER_A = 0x1d5d4; // 𝗔
const BOLD_LOWER_A = 0x1d5ee; // 𝗮
const BOLD_DIGIT_0 = 0x1d7ec; // 𝟬

function toBoldCodePoint(cp: number): number | null {
  if (cp >= UPPER_A && cp <= UPPER_Z) return BOLD_UPPER_A + (cp - UPPER_A);
  if (cp >= LOWER_A && cp <= LOWER_Z) return BOLD_LOWER_A + (cp - LOWER_A);
  if (cp >= DIGIT_0 && cp <= DIGIT_9) return BOLD_DIGIT_0 + (cp - DIGIT_0);
  return null;
}

function fromBoldCodePoint(cp: number): number | null {
  if (cp >= BOLD_UPPER_A && cp <= BOLD_UPPER_A + 25) return UPPER_A + (cp - BOLD_UPPER_A);
  if (cp >= BOLD_LOWER_A && cp <= BOLD_LOWER_A + 25) return LOWER_A + (cp - BOLD_LOWER_A);
  if (cp >= BOLD_DIGIT_0 && cp <= BOLD_DIGIT_0 + 9) return DIGIT_0 + (cp - BOLD_DIGIT_0);
  return null;
}

/**
 * Aplica o quita negrita Unicode sobre `text` (pensado para el texto
 * seleccionado, no para el Copy completo). Regla de selección mixta: si TODA
 * la parte transformable (A-Z/a-z/0-9, en cualquiera de los dos estados) ya
 * está en negrita, se quita; si no, se aplica a toda la parte transformable.
 * Cualquier otro carácter (espacios, acentuados, emojis, saltos de línea,
 * puntuación) se preserva exactamente, sin tocar.
 */
export function toggleUnicodeBold(text: string): string {
  const chars = Array.from(text); // por codepoint: surrogate pairs cuentan como una unidad

  let hasTransformable = false;
  let allAlreadyBold = true;
  for (const ch of chars) {
    const cp = ch.codePointAt(0)!;
    if (toBoldCodePoint(cp) !== null) {
      hasTransformable = true;
      allAlreadyBold = false;
    } else if (fromBoldCodePoint(cp) !== null) {
      hasTransformable = true;
    }
  }

  if (!hasTransformable) return text;

  const shouldRemove = allAlreadyBold;

  return chars
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      const target = shouldRemove ? fromBoldCodePoint(cp) : toBoldCodePoint(cp);
      return target !== null ? String.fromCodePoint(target) : ch;
    })
    .join("");
}

/** Cuenta caracteres percibidos (por codepoint): un carácter Unicode fuera del
 * BMP (p. ej. una letra en negrita matemática) cuenta como 1, no como 2. */
export function countPerceivedCharacters(text: string): number {
  return Array.from(text).length;
}
