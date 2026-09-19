import { cn } from "cn";
import type { Status } from "@/types";

/**
 * Pill de estado de una publicación: fondo pleno del color del estado + texto blanco, sin punto aparte.
 * Es el único lugar donde se traduce estado -> label/color visual (los datos vienen de `useLookups().statuses`),
 * usado por cards, chips del mes, lista, drawer y el selector de Estado del formulario.
 *
 * - "xs" / "sm": contextos compactos de calendario (mayúsculas, como las cards).
 * - "md": drawer y selector (mismo pill, en tamaño de lectura, sin mayúsculas).
 */
const SIZE_CLASSES = {
  xs: "px-1.5 py-px text-[8px] uppercase tracking-wide",
  sm: "px-1.5 py-0.5 text-[9px] uppercase tracking-wide",
  md: "px-2.5 py-0.5 text-xs",
} as const;

interface StatusPillProps {
  status: Pick<Status, "label" | "color">;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function StatusPill({ status, size = "md", className }: StatusPillProps) {
  return (
    <span
      title={status.label}
      className={cn(
        "inline-flex w-fit max-w-full min-w-0 items-center truncate rounded-full font-semibold text-white",
        SIZE_CLASSES[size],
        className
      )}
      style={{ backgroundColor: status.color }}
    >
      <span className="truncate">{status.label}</span>
    </span>
  );
}
