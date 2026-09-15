"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarFormDialog } from "@/components/admin/calendar-form-dialog";
import { CalendarRowActions } from "@/components/admin/calendar-row-actions";
import { CALENDAR_STATUS_LABELS } from "@/lib/calendar-labels";
import type { Calendar, Client } from "@/types";

interface CalendarsPageClientProps {
  calendars: Calendar[];
  clients: Client[];
  publicationCountByCalendarId: Record<string, number>;
}

export function CalendarsPageClient({ calendars, clients, publicationCountByCalendarId }: CalendarsPageClientProps) {
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const activeCalendars = calendars.filter((c) => c.status !== "archived");
  const archivedCalendars = calendars.filter((c) => c.status === "archived");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Calendarios</h1>
        <CalendarFormDialog clients={clients} />
      </div>

      <CalendarsTable
        calendars={activeCalendars}
        clients={clients}
        clientById={clientById}
        publicationCountByCalendarId={publicationCountByCalendarId}
        emptyMessage={
          clients.length === 0
            ? "Primero creá un cliente en /admin/clients."
            : 'Todavía no hay calendarios. Creá el primero con "Nuevo calendario".'
        }
      />

      {archivedCalendars.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Archivados</h2>
          <CalendarsTable
            calendars={archivedCalendars}
            clients={clients}
            clientById={clientById}
            publicationCountByCalendarId={publicationCountByCalendarId}
            emptyMessage=""
          />
        </div>
      )}
    </div>
  );
}

function CalendarsTable({
  calendars,
  clients,
  clientById,
  publicationCountByCalendarId,
  emptyMessage,
}: {
  calendars: Calendar[];
  clients: Client[];
  clientById: Map<string, Client>;
  publicationCountByCalendarId: Record<string, number>;
  emptyMessage: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Calendario</TableHead>
            <TableHead>Publicaciones</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calendars.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {calendars.map((calendar) => {
            const client = clientById.get(calendar.clientId);
            return (
              <TableRow key={calendar.id}>
                <TableCell className="text-foreground">
                  {client ? (
                    <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-1.5 hover:underline">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
                      {client.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="font-medium text-foreground">{calendar.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {publicationCountByCalendarId[calendar.id] ?? 0}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{CALENDAR_STATUS_LABELS[calendar.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {client && (
                    <CalendarRowActions
                      client={client}
                      calendar={calendar}
                      publicationCount={publicationCountByCalendarId[calendar.id] ?? 0}
                      clients={clients}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
