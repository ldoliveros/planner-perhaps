"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ChangelogEntry } from "@/lib/changelog";

interface UpdateBannerProps {
  version: string;
  entries: ChangelogEntry[];
  isSaving: boolean;
  error: string | null;
  onDismiss: () => void;
}

/**
 * Card flotante "Nuevas actualizaciones" — no bloqueante, esquina inferior
 * derecha. Puramente presentacional: quien la monta decide cuándo mostrarla
 * y qué hacer al descartarla (persistir last_seen_version).
 *
 * Solo dos acciones, a propósito (sin X de cierre): "Ver todas las
 * novedades" es navegación pura (no marca como visto — el historial en
 * /changelog se puede revisar en cualquier momento sin que eso cuente como
 * "ya vi esta versión"). "Entendido" es la única acción que persiste.
 */
export function UpdateBanner({ version, entries, isSaving, error, onDismiss }: UpdateBannerProps) {
  if (entries.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="Nuevas actualizaciones"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <h3 className="mb-2 text-sm font-semibold text-foreground">Nuevas actualizaciones · v{version}</h3>
      <ul className="mb-3 flex flex-col gap-1.5">
        {entries.map((entry, i) => (
          <li key={i} className="flex items-start gap-1.5 text-sm text-foreground">
            <span className="mt-0.5 shrink-0 text-green-600">✓</span>
            {entry.text}
          </li>
        ))}
      </ul>
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <Link href="/changelog" className="text-xs font-medium text-primary hover:underline">
          Ver todas las novedades
        </Link>
        <Button size="sm" variant="outline" onClick={onDismiss} disabled={isSaving}>
          {isSaving ? "Guardando..." : error ? "Reintentar" : "Entendido"}
        </Button>
      </div>
    </div>
  );
}
