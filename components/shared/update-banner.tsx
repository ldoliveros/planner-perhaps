"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChangelogEntry } from "@/lib/changelog";

interface UpdateBannerProps {
  version: string;
  entries: ChangelogEntry[];
  onDismiss: () => void;
}

/**
 * Card flotante "Nuevas actualizaciones" — no bloqueante, esquina inferior
 * derecha. Puramente presentacional: quien la monta decide cuándo mostrarla
 * y qué hacer al descartarla (persistir last_seen_version).
 */
export function UpdateBanner({ version, entries, onDismiss }: UpdateBannerProps) {
  if (entries.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="Nuevas actualizaciones"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Nuevas actualizaciones · v{version}</h3>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <ul className="mb-3 flex flex-col gap-1.5">
        {entries.map((entry, i) => (
          <li key={i} className="flex items-start gap-1.5 text-sm text-foreground">
            <span className="mt-0.5 shrink-0 text-green-600">✓</span>
            {entry.text}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <Link href="/changelog" onClick={onDismiss} className="text-xs font-medium text-primary hover:underline">
          Ver todas las novedades
        </Link>
        <Button size="sm" variant="outline" onClick={onDismiss}>
          Entendido
        </Button>
      </div>
    </div>
  );
}
