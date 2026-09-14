function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return {
    r: parseInt(full.substring(0, 2), 16) || 0,
    g: parseInt(full.substring(2, 4), 16) || 0,
    b: parseInt(full.substring(4, 6), 16) || 0,
  };
}

/**
 * Devuelve negro o blanco según cuál sea legible sobre el color de fondo dado
 * (hex, ej. "#16A34A"). Fórmula YIQ estándar, suficiente para UI.
 */
export function getContrastTextColor(hex: string): "#0f172a" | "#ffffff" {
  const { r, g, b } = parseHex(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#ffffff";
}

/** Convierte un hex a rgba() con la opacidad dada — para tintes muy sutiles del color de marca. */
export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
