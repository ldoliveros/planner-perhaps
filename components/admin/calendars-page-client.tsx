"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarFormDialog } from "@/components/admin/calendar-form-dialog";
import type { Calendar, Client } from "@/types";

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

const STATUS_LABELS: Record<Calendar["status"], string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

interface CalendarsPageClientProps {
  calendars: Calendar[];
  clients: Client[];
  publicationCountByCalendarId: Record<string, number>;
}

export function CalendarsPageClient({ calendars, clients, publicationCountByCalendarId }: CalendarsPageClientProps) {
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Calendarios</h1>
        <CalendarFormDialog clients={clients} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Calendario</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Publicaciones</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calendars.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {clients.length === 0
                    ? "Primero creá un cliente en /admin/clients."
                    : 'Todavía no hay calendarios. Creá el primero con "Nuevo calendario".'}
                </TableCell>
              </TableRow>
            )}
            {calendars.map((calendar) => {
              const client = clientById.get(calendar.clientId);
              return (
                <TableRow key={calendar.id}>
                  <TableCell className="text-foreground">{client?.name ?? "—"}</TableCell>
                  <TableCell className="font-medium text-foreground">{calendar.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {MONTH_LABELS[calendar.month - 1]} {calendar.year}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {publicationCountByCalendarId[calendar.id] ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABELS[calendar.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/admin/calendars/${calendar.id}`} />}
                      >
                        Ver
                      </Button>
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
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
