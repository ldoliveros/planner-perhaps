import { cn } from "cn";

interface PerhapsIsologoProps {
  className?: string;
  size?: number;
}

/**
 * Isotipo oficial de Perhaps (mismo path data que /public/brand/perhaps-isologo.svg),
 * renderizado inline en vez de vía <img>/next/image: un SVG referenciado por
 * src="...svg" es un documento externo aislado — la propiedad CSS `color`
 * del host nunca penetra su currentColor interno. Inline sí hereda el color
 * del contenedor (blanco en el sidebar oscuro, currentColor en cualquier
 * otro lado). El punto de la marca se mantiene siempre en el azul oficial.
 */
export function PerhapsIsologo({ className, size = 24 }: PerhapsIsologoProps) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={cn("shrink-0", className)} aria-hidden="true">
      <path
        fill="#26a9e0"
        d="M8.96,35.13c0-1.13.36-2.08,1.07-2.85s1.67-1.16,2.85-1.16,2.18.39,2.9,1.16c.72.77,1.07,1.72,1.07,2.85s-.36,2.08-1.07,2.85-1.68,1.16-2.9,1.16-2.14-.39-2.85-1.16c-.72-.77-1.07-1.72-1.07-2.85Z"
      />
      <path
        fill="currentColor"
        d="M27.88,3.47c-2.11-1.75-5.23-2.62-9.33-2.62-.31,0-.65,0-1,.02v-.02c-1.1,0-2.23.09-3.4.25-1.17.17-2.19.44-3.08.79-1.4.58-2.1,1.51-2.1,2.79,0,.55.13,1.07.39,1.58.26.5.57.87.94,1.12.88-.37,1.88-.68,2.99-.96s2.24-.41,3.4-.41c.44-.03,2.01.06,2.55.13,1.91.27,2.6.67,3.45,1.37.85.7,1.28,1.73,1.28,3.1s-.45,2.42-1.34,3.14c-.9.73-2.13,1.1-3.67,1.1h-.15c-1.22.07-2.41.25-3.54.53-1.41.35-2.62.83-3.63,1.43-.73.46-1.3.98-1.71,1.58-.41.59-.62,1.32-.62,2.17v5.58c0,1.19.29,2,.9,2.46.59.46,1.53.68,2.81.68.64,0,1.23-.03,1.78-.11s.97-.16,1.28-.25v-7.54c.64-.37,1.41-.65,2.33-.86.39-.09,2.82-.34,2.85-.35,1.67-.19,3.29-.54,4.4-1.05,1.73-.81,3.07-1.94,3.99-3.4s1.39-3.17,1.39-5.11c0-3.01-1.06-5.39-3.17-7.14h.01Z"
      />
    </svg>
  );
}
