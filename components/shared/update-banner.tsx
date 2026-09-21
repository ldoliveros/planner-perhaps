"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface UpdateBannerProps {
  version: string;
  isSaving: boolean;
  error: string | null;
  onDismiss: () => void;
}

/**
 * Aviso flotante de nueva versión — no bloqueante, esquina inferior derecha (en < md: pegado abajo
 * a todo el ancho). Puramente presentacional y sin copy específico por versión: solo muestra la
 * versión y un link a su sección en /changelog (ahí están las novedades). Quien lo monta decide
 * cuándo mostrarlo y qué hacer al descartarlo (persistir last_seen_version).
 *
 * "Ver mejoras de esta versión" es navegación pura (no marca como visto: el historial se puede
 * revisar sin que cuente como "ya vi esta versión"). "Entendido" es la única acción que persiste.
 */
export function UpdateBanner({ version, isSaving, error, onDismiss }: UpdateBannerProps) {
  return (
    <div
      role="dialog"
      aria-label="Nueva versión disponible"
      className="fixed right-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-lg max-md:inset-x-0 max-md:right-0 max-md:bottom-0 max-md:w-full max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 max-md:pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <h3 className="text-sm font-semibold text-foreground">Planner by Perhaps se actualizó a v{version}</h3>
      <p className="text-sm text-muted-foreground">Descubrí las últimas mejoras y novedades del Planner.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Link href={`/changelog#v${version}`} className="text-xs font-medium text-primary hover:underline max-md:py-3.5">
          Ver mejoras de esta versión →
        </Link>
        <Button size="sm" variant="outline" className="pointer-coarse:h-11" onClick={onDismiss} disabled={isSaving}>
          {isSaving ? "Guardando..." : error ? "Reintentar" : "Entendido"}
        </Button>
      </div>
    </div>
  );
}
