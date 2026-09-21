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

function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Como getContrastTextColor pero elige por ratio de contraste WCAG (el mayor entre blanco y el texto oscuro
 * de la app). Más fiel que YIQ en colores medios (celestes, verdes), donde YIQ puede dejar texto blanco poco legible.
 */
export function getReadableTextColor(hex: string): "#0f172a" | "#ffffff" {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#0f172a") ? "#ffffff" : "#0f172a";
}
