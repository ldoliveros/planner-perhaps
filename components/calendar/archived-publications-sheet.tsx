"use client";

import { useState } from "react";
import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/shared/status-pill";
import { useLookups } from "@/components/providers/lookups-provider";
import { formatFullDate } from "@/lib/date-utils";
import type { Publication } from "@/types";

interface ArchivedPublicationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = cargando. */
  publications: Publication[] | null;
  /** Calendario global ("Ver todos"): cada fila muestra el cliente. */
  showClient: boolean;
  onRestore: (publication: Publication) => Promise<void>;
  onDeletePermanently: (publication: Publication) => Promise<boolean>;
}

function formatArchivedAt(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/**
 * "Publicaciones archivadas" (v1.6, solo staff): panel lateral con la lista compacta de archivadas, más recientes
 * primero. Restaurar la devuelve al Planner tal como estaba (fecha, estado, contenido, comentarios, reacciones);
 * Eliminar definitivamente pide confirmación y usa el mismo borrado de siempre.
 */
export function ArchivedPublicationsSheet({
  open,
  onOpenChange,
  publications,
  showClient,
  onRestore,
  onDeletePermanently,
}: ArchivedPublicationsSheetProps) {
  const { statuses, getClient } = useLookups();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Publication | null>(null);

  async function restore(publication: Publication) {
    setBusyId(publication.id);
    try {
      await onRestore(publication);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      if (await onDeletePermanently(deleteTarget)) setDeleteTarget(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" mobile="fullscreen" className="gap-0 data-[side=right]:w-[460px] data-[side=right]:sm:max-w-[460px]">
          <div className="border-b border-border px-4 pt-4 pb-3 pr-12">
            <SheetTitle className="text-base font-semibold">Publicaciones archivadas</SheetTitle>
            <p className="text-sm text-muted-foreground">
              No aparecen en el Planner ni en las estadísticas. Restaurarlas las devuelve tal como estaban.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {publications === null ? (
              <p className="flex items-center gap-1.5 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Cargando archivadas...
              </p>
            ) : publications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">No hay publicaciones archivadas.</p>
            ) : (
              <ul className="flex flex-col">
                {publications.map((publication) => {
                  const status = statuses.find((s) => s.id === publication.statusId);
                  const busy = busyId === publication.id;
                  return (
                    <li key={publication.id} className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 last:border-b-0">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-foreground" title={publication.title}>
                            {publication.title}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {showClient && `${getClient(publication.clientId)?.name ?? ""} · `}
                            {formatFullDate(publication.publicationDate)}
                          </span>
                          {publication.archivedAt && (
                            <span className="text-xs text-muted-foreground">Archivada el {formatArchivedAt(publication.archivedAt)}</span>
                          )}
                        </div>
                        {status && <StatusPill status={status} className="shrink-0" />}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => setDeleteTarget(publication)}
                        >
                          <Trash2 className="size-3.5" />
                          Eliminar definitivamente
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => void restore(publication)}>
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArchiveRestore className="size-3.5" />}
                          Restaurar
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(next) => !next && busyId === null && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar definitivamente esta publicación?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              &quot;{deleteTarget?.title}&quot; se borra junto con sus imágenes, comentarios y reacciones. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busyId !== null} onClick={() => void confirmDelete()}>
              {busyId !== null ? "Eliminando..." : "Eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
