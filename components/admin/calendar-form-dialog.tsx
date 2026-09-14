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
  trigger?: React.ReactElement;
  onSaved?: (calendarId: string) => void;
}

type CalendarFormDialogProps =
  | (CalendarFormDialogBaseProps & { clients: Client[]; lockedClient?: undefined })
  | (CalendarFormDialogBaseProps & { clients?: undefined; lockedClient: Client });

export function CalendarFormDialog({ clients, lockedClient, calendar, trigger, onSaved }: CalendarFormDialogProps) {
  const [open, setOpen] = useState(false);
  // Se incrementa cada vez que el diálogo se abre, para remontar CalendarFormBody
  // (un guardado anterior fallido no debe dejar el error/campos pegados).
  const [sessionKey, setSessionKey] = useState(0);

  function handleOpenChange(next: boolean) {
    if (next) setSessionKey((k) => k + 1);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            setOpen(false);
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
  const [driveFolderUrl, setDriveFolderUrl] = useState(calendar?.driveFolderUrl ?? "");

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
            items={Object.fromEntries((clients ?? []).map((c) => [c.id, c.name]))}
          >
            <SelectTrigger id="clientId" className="w-full">
              <SelectValue placeholder="Elegí un cliente" />
            </SelectTrigger>
            <SelectContent>
              {(clients ?? []).map((c) => (
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
          placeholder="Ej: General, Cosmiatría, GDL"
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="driveFolderUrl">Carpeta de Drive (opcional)</Label>
        <Input
          id="driveFolderUrl"
          name="driveFolderUrl"
          type="url"
          placeholder="https://drive.google.com/drive/folders/..."
          value={driveFolderUrl}
          onChange={(e) => setDriveFolderUrl(e.target.value)}
        />
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
