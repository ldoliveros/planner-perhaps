"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, MoreHorizontal, Pencil, RefreshCcw, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLookups } from "@/components/providers/lookups-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { deletePublication, movePublicationToDate, setPublicationStatus } from "@/lib/actions/publications";
import { formatFullDateFromDate } from "@/lib/date-utils";
import { toast } from "@/lib/toast";
import { cn } from "cn";
import type { Publication } from "@/types";

interface PublicationQuickActionsProps {
  publication: Publication;
  clientId: string;
  onEdit: () => void;
  onDuplicate: () => void;
  className?: string;
}

/**
 * Menú `•••` reutilizado por Semana/Mes/Lista (Bloque C). Centraliza Editar,
 * Duplicar, Cambiar fecha, Cambiar estado y Eliminar en un solo componente — Editar/Duplicar
 * delegan al PublicationForm existente vía callbacks (vive un nivel arriba,
 * en CalendarScreen); Cambiar estado y Eliminar son autosuficientes acá,
 * mismo patrón que ya usaban el drawer y el propio formulario.
 */
export function PublicationQuickActions({ publication, clientId, onEdit, onDuplicate, className }: PublicationQuickActionsProps) {
  const { statuses } = useLookups();
  const router = useRouter();
  const [statusPending, setStatusPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();
  // Cambiar fecha (alternativa táctil/teclado al drag & drop): selector nativo de fecha + movePublicationToDate.
  const [dateOpen, setDateOpen] = useState(false);
  const [dateValue, setDateValue] = useState(publication.publicationDate);
  const [movingDate, setMovingDate] = useState(false);
  // Mientras el cambio de estado se guarda Y el Planner termina de refrescar,
  // el menú queda deshabilitado: si no, "Editar" podría abrir el formulario con
  // el estado viejo de la publicación y pisar el cambio al guardar.
  const busy = statusPending || isRefreshing || movingDate;

  async function handleMoveDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!dateValue || movingDate) return;
    if (dateValue === publication.publicationDate) {
      setDateOpen(false);
      return;
    }
    setMovingDate(true);
    let result: { error: string | null };
    try {
      // Solo cambia publication_date: la hora y el resto de los campos quedan intactos.
      result = await movePublicationToDate(publication.id, dateValue);
    } catch {
      result = { error: "No se pudo conectar con el servidor. Probá de nuevo." };
    }
    setMovingDate(false);
    if (result.error) {
      toast.error("No se pudo mover la publicación", result.error);
      return;
    }
    setDateOpen(false);
    startRefresh(() => {
      router.refresh();
    });
    toast.success(`Publicación movida al ${formatFullDateFromDate(new Date(`${dateValue}T00:00:00`)).toLowerCase()}`);
  }

  async function handleStatusChange(statusId: string) {
    if (statusId === publication.statusId || busy) return;
    setStatusPending(true);
    const result = await setPublicationStatus(publication.id, statusId);
    setStatusPending(false);
    if (result.error) {
      toast.error("No se pudo actualizar el estado", result.error);
      return;
    }
    startRefresh(() => {
      router.refresh();
    });
    const label = statuses.find((s) => s.id === statusId)?.label ?? "";
    toast.success(`Estado actualizado a ${label}`);
  }

  function handleConfirmDelete() {
    startDeleteTransition(async () => {
      setDeleteError(null);
      const result = await deletePublication(publication.id, clientId);
      if (result.error) {
        setDeleteError(result.error);
        toast.error("No se pudo eliminar", result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      toast.success("Publicación eliminada");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Acciones de publicación"
              aria-busy={busy}
              disabled={busy}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60",
                busy && "animate-pulse",
                className
              )}
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setDateValue(publication.publicationDate);
              setDateOpen(true);
            }}
          >
            <CalendarDays />
            Cambiar fecha
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <RefreshCcw />
              Cambiar estado
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={publication.statusId} onValueChange={(value) => handleStatusChange(value as string)}>
                {statuses.map((status) => (
                  <DropdownMenuRadioItem key={status.id} value={status.id} disabled={statusPending} closeOnClick>
                    <StatusPill status={status} />
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dateOpen} onOpenChange={setDateOpen}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <form onSubmit={handleMoveDate} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Cambiar fecha</DialogTitle>
              <DialogDescription>Elegí el nuevo día para &quot;{publication.title}&quot;. La hora se conserva.</DialogDescription>
            </DialogHeader>
            <Input
              type="date"
              required
              aria-label="Nueva fecha"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="pointer-coarse:h-11"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={movingDate || !dateValue}>
                {movingDate ? "Moviendo..." : "Mover"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar publicación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que querés eliminar &quot;{publication.title}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleConfirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
