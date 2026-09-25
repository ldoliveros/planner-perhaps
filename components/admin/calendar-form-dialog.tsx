"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveCalendar, type CalendarFormState } from "@/lib/actions/calendars";
import { CALENDAR_STATUS_LABELS } from "@/lib/calendar-labels";
import { toast } from "@/lib/toast";
import type { Calendar, CalendarStatus, Client } from "@/types";

const INITIAL_STATE: CalendarFormState = { error: null, savedAt: null, calendarId: null };

interface CalendarFormDialogBaseProps {
  calendar?: Calendar;
  /** `null` omite el trigger propio: útil cuando otro elemento (ej. un ítem de menú) controla `open`. */
  trigger?: React.ReactElement | null;
  onSaved?: (calendarId: string) => void;
  /** Apertura controlada externamente (ej. desde un DropdownMenuItem). Sin esto, el diálogo maneja su propio estado. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type CalendarFormDialogProps =
  | (CalendarFormDialogBaseProps & { clients: Client[]; lockedClient?: undefined })
  | (CalendarFormDialogBaseProps & { clients?: undefined; lockedClient: Client });

export function CalendarFormDialog({
  clients,
  lockedClient,
  calendar,
  trigger,
  onSaved,
  open: openProp,
  onOpenChange,
}: CalendarFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  // Se incrementa cada vez que el diálogo se abre, para remontar CalendarFormBody
  // (un guardado anterior fallido no debe dejar el error/campos pegados).
  const [sessionKey, setSessionKey] = useState(0);

  function handleOpenChange(next: boolean) {
    if (next) setSessionKey((k) => k + 1);
    setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== null && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button size="sm" className="gap-1.5">
                <Plus />
                Nuevo calendario
              </Button>
            )
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{calendar ? "Editar calendario" : "Nuevo calendario"}</DialogTitle>
        </DialogHeader>
        <CalendarFormBody
          key={sessionKey}
          clients={clients}
          lockedClient={lockedClient}
          calendar={calendar}
          onSaved={(calendarId) => {
            handleOpenChange(false);
            onSaved?.(calendarId);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CalendarFormBody({
  clients,
  lockedClient,
  calendar,
  onSaved,
}: {
  clients?: Client[];
  lockedClient?: Client;
  calendar?: Calendar;
  onSaved: (calendarId: string) => void;
}) {
  const [state, formAction, isPending] = useActionState(saveCalendar, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const router = useRouter();

  const [clientId, setClientId] = useState(lockedClient?.id ?? calendar?.clientId ?? "");
  const [name, setName] = useState(calendar?.name ?? "");
  const [description, setDescription] = useState(calendar?.description ?? "");
  const [status, setStatus] = useState<CalendarStatus>(calendar?.status ?? "active");

  // Clientes archivados no se ofrecen para calendarios nuevos, pero si este
  // calendario ya pertenece a uno (editando desde la lista global), se
  // mantiene visible para no romper el valor ya seleccionado.
  const selectableClients = (clients ?? []).filter((c) => c.active || c.id === clientId);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      router.refresh();
      toast.success(calendar ? "Calendario guardado" : "Calendario creado");
      if (state.calendarId) onSaved(state.calendarId);
    }
  }, [state.savedAt, state.calendarId, onSaved, router, calendar]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {calendar && <input type="hidden" name="id" value={calendar.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clientId">Cliente</Label>
        {lockedClient ? (
          <>
            <input type="hidden" name="clientId" value={lockedClient.id} />
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-sm text-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: lockedClient.color }} />
              {lockedClient.name}
            </div>
          </>
        ) : (
          <Select
            name="clientId"
            value={clientId}
            onValueChange={(value) => setClientId(value as string)}
            items={Object.fromEntries(selectableClients.map((c) => [c.id, c.name]))}
          >
            <SelectTrigger id="clientId" className="w-full">
              <SelectValue placeholder="Elegí un cliente" />
            </SelectTrigger>
            <SelectContent>
              {selectableClients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Calendario general"
          required
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Estado</Label>
        <Select
          name="status"
          value={status}
          onValueChange={(value) => setStatus(value as CalendarStatus)}
          items={CALENDAR_STATUS_LABELS}
        >
          <SelectTrigger id="status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="archived">Archivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
