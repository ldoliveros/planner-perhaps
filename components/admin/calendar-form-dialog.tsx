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
import { saveCalendar, type CalendarFormState } from "@/lib/actions/calendars";
import type { Calendar, CalendarStatus, Client } from "@/types";

const INITIAL_STATE: CalendarFormState = { error: null, savedAt: null, calendarId: null };

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const STATUS_ITEMS: Record<CalendarStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

interface CalendarFormDialogProps {
  clients: Client[];
  calendar?: Calendar;
  trigger?: React.ReactElement;
  onSaved?: (calendarId: string) => void;
}

export function CalendarFormDialog({ clients, calendar, trigger, onSaved }: CalendarFormDialogProps) {
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
  calendar,
  onSaved,
}: {
  clients: Client[];
  calendar?: Calendar;
  onSaved: (calendarId: string) => void;
}) {
  const [state, formAction, isPending] = useActionState(saveCalendar, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const router = useRouter();
  const today = new Date();

  const [clientId, setClientId] = useState(calendar?.clientId ?? "");
  const [name, setName] = useState(calendar?.name ?? "");
  const [month, setMonth] = useState(String(calendar?.month ?? today.getMonth() + 1));
  const [year, setYear] = useState(calendar?.year ?? today.getFullYear());
  const [status, setStatus] = useState<CalendarStatus>(calendar?.status ?? "active");
  const [driveFolderUrl, setDriveFolderUrl] = useState(calendar?.driveFolderUrl ?? "");

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      router.refresh();
      if (state.calendarId) onSaved(state.calendarId);
    }
  }, [state.savedAt, state.calendarId, onSaved, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {calendar && <input type="hidden" name="id" value={calendar.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clientId">Cliente</Label>
        <Select
          name="clientId"
          value={clientId}
          onValueChange={(value) => setClientId(value as string)}
          items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
        >
          <SelectTrigger id="clientId" className="w-full">
            <SelectValue placeholder="Elegí un cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Septiembre 2026"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="month">Mes</Label>
          <Select
            name="month"
            value={month}
            onValueChange={(value) => setMonth(value as string)}
            items={Object.fromEntries(MONTH_LABELS.map((label, index) => [String(index + 1), label]))}
          >
            <SelectTrigger id="month" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, index) => (
                <SelectItem key={label} value={String(index + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="year">Año</Label>
          <Input
            id="year"
            name="year"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Estado</Label>
        <Select
          name="status"
          value={status}
          onValueChange={(value) => setStatus(value as CalendarStatus)}
          items={STATUS_ITEMS}
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
