"use client";

import type { ReactNode } from "react";
import { cn } from "cn";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * Patrón admin mobile (Bloque E): la misma lista se muestra como tabla en md+ y como cards en < md.
 * Se monta UNA sola versión una vez hidratado (así los diálogos/estados de cada fila no se duplican);
 * antes de hidratar (SSR) se emiten las dos y el CSS muestra la que corresponde, sin parpadeo.
 * Cada pantalla define sus propias cards (las entidades no comparten layout); acá solo se comparte el
 * mecanismo y el estilo base de card / acciones.
 */
export function ResponsiveList({ table, cards }: { table: ReactNode; cards: ReactNode }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return (
    <>
      {isDesktop !== false && <div className="max-md:hidden">{table}</div>}
      {isDesktop !== true && <div className="flex flex-col gap-2 md:hidden">{cards}</div>}
    </>
  );
}

/** Card base de una fila en mobile: contenido arriba y acciones abajo (ver CARD_ACTIONS_CLASS). */
export function RowCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-3", className)}>{children}</div>;
}

/** Empty state en formato card (las tablas usan una fila con colSpan). */
export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * Contenedor de acciones de una card: botones que envuelven y, en dispositivos táctiles, de 44 px
 * (los botones de las filas son `size="sm"`, que en touch mide 40 px).
 */
export const CARD_ACTIONS_CLASS =
  "flex flex-wrap items-center gap-1.5 [&_a]:pointer-coarse:h-11 [&_button]:pointer-coarse:h-11";
