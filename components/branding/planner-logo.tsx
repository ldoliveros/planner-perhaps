import Image from "next/image";
import { cn } from "cn";

/**
 * Marca "Planner by Perhaps". Usa los SVG definitivos de /public/brand tal cual (no se modifican ni se redibujan):
 * - "full": marca principal para fondos claros (login, header del Client, barra superior mobile).
 * - "negative": versión reducida en negativo para fondos oscuros (sidebar abierta y panel de navegación mobile).
 * - "icon": isotipo/favicon (sidebar cerrada).
 */
const VARIANTS = {
  full: { src: "/brand/perhaps-planner-logo.svg", ratio: 992.84 / 328.93 },
  negative: { src: "/brand/perhaps-planner-logo-reduced-scale-negative.svg", ratio: 992.84 / 203.12 },
  icon: { src: "/brand/perhaps-planner-favicon.svg", ratio: 1 },
} as const;

interface PlannerLogoProps {
  variant: keyof typeof VARIANTS;
  /** Alto en px; el ancho se calcula con la proporción real del SVG. */
  height: number;
  className?: string;
  priority?: boolean;
}

export function PlannerLogo({ variant, height, className, priority = false }: PlannerLogoProps) {
  const { src, ratio } = VARIANTS[variant];
  return (
    <Image
      src={src}
      alt="Planner by Perhaps"
      width={Math.round(height * ratio)}
      height={height}
      priority={priority}
      className={cn("w-auto shrink-0", className)}
      style={{ height }}
    />
  );
}
