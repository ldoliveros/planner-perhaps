"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CalendarFormDialog } from "@/components/admin/calendar-form-dialog";
import { deleteCalendar, setCalendarArchived } from "@/lib/actions/calendars";
import { toast } from "@/lib/toast";
import { cn } from "cn";
import type { Calendar, Client } from "@/types";

interface CalendarRowActionsProps {
  client: Client;
  calendar: Calendar;
  publicationCount: number;
  clients?: Client[];
  className?: string;
}

export function CalendarRowActions({ client, calendar, publicationCount, clients, className }: CalendarRowActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isArchiving, startArchiveTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isArchived = calendar.status === "archived";
  const canDelete = isArchived && publicationCount === 0;

  function handleToggleArchived() {
    startArchiveTransition(async () => {
      const result = await setCalendarArchived(calendar.id, client.id, !isArchived);
      if (result.error) {
        toast.error(isArchived ? "No se pudo restaurar" : "No se pudo archivar", result.error);
        return;
      }
      router.refresh();
      toast.success(isArchived ? "Calendario restaurado" : "Calendario archivado");
    });
  }

  function handleConfirmDelete() {
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteCalendar(calendar.id, client.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      toast.success("Calendario eliminado");
    });
  }

  return (
    <div className={cn("flex flex-wrap justify-end gap-1", className)}>
      <Button size="sm" nativeButton={false} render={<Link href={`/admin/clients/${client.id}/planner?calendars=${calendar.id}`} />}>
        Ver
      </Button>
      {clients ? (
        <CalendarFormDialog
          clients={clients}
          calendar={calendar}
          trigger={
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Pencil className="size-3.5" />
              Editar
            </Button>
          }
        />
      ) : (
        <CalendarFormDialog
          lockedClient={client}
          calendar={calendar}
          trigger={
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Pencil className="size-3.5" />
              Editar
            </Button>
          }
        />
      )}
      <Button variant="ghost" size="sm" className="gap-1.5" disabled={isArchiving} onClick={handleToggleArchived}>
        {isArchived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
        {isArchived ? "Restaurar" : "Archivar"}
      </Button>
      {isArchived && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-destructive" />}>
            <Trash2 className="size-3.5" />
            Eliminar definitivamente
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar el calendario &quot;{calendar.name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                {canDelete
                  ? "Esta acción es irreversible. El calendario no tiene publicaciones asociadas."
                  : `Este calendario contiene ${publicationCount} publicaci${publicationCount === 1 ? "ón" : "ones"} y no puede eliminarse definitivamente. Podés mantenerlo archivado para conservar el historial.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel>{canDelete ? "Cancelar" : "Entendido"}</AlertDialogCancel>
              {canDelete && (
                <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleConfirmDelete}>
                  Eliminar definitivamente
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
