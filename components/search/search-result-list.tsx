"use client";

import Image from "next/image";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ImageIcon } from "lucide-react";
import { ClientBadge } from "@/components/shared/client-badge";
import { StatusPill } from "@/components/shared/status-pill";
import { useLookups } from "@/components/providers/lookups-provider";
import type { Publication } from "@/types";

/**
 * Resultados compactos del modal de búsqueda (v1.6): una fila por publicación con miniatura, título, espacio ·
 * calendario, fecha y estado. Toda la fila es un botón que abre la publicación (el caller usa `/p/<id>`). Sin acciones
 * extra: abrir la publicación lleva a la vista de siempre, con sus permisos.
 */
export function SearchResultList({
  publications,
  onOpen,
}: {
  publications: Publication[];
  onOpen: (publication: Publication) => void;
}) {
  const { getCalendar, getClient, getStatus } = useLookups();
  return (
    <ul className="flex flex-col" aria-label="Resultados">
      {publications.map((publication) => {
        const hero = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0];
        const client = getClient(publication.clientId);
        const calendar = getCalendar(publication.calendarId);
        const status = getStatus(publication.statusId);
        const date = format(new Date(`${publication.publicationDate}T00:00:00`), "d LLL yyyy", { locale: es }).replace(".", "");
        return (
          <li key={publication.id}>
            <button
              type="button"
              onClick={() => onOpen(publication)}
              className="flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none pointer-coarse:py-2.5"
            >
              <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                {hero?.thumbnailUrl ? (
                  <Image src={hero.thumbnailUrl} alt="" fill sizes="40px" className="object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground/40">
                    <ImageIcon className="size-4" />
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">{publication.title}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {client && <ClientBadge client={client} size="md" className="min-w-0 shrink" />}
                  {calendar && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="min-w-0 truncate">{calendar.name}</span>
                    </>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {status && <StatusPill status={status} size="sm" />}
                <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{date}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
