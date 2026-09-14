"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientFormDialog } from "@/components/admin/client-form-dialog";
import { CalendarFormDialog } from "@/components/admin/calendar-form-dialog";
import { getContrastTextColor } from "@/lib/color-contrast";
import { CALENDAR_STATUS_LABELS, MONTH_LABELS } from "@/lib/calendar-labels";
import type { Calendar, Client } from "@/types";

interface ClientDetailPageClientProps {
  client: Client;
  calendars: Calendar[];
  publicationCountByCalendarId: Record<string, number>;
}

export function ClientDetailPageClient({
  client,
  calendars,
  publicationCountByCalendarId,
}: ClientDetailPageClientProps) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Link
        href="/admin/clients"
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Clientes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div
            className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-semibold"
            style={
              client.logoUrl
                ? undefined
                : { backgroundColor: client.color, color: getContrastTextColor(client.color) }
            }
          >
            {client.logoUrl ? (
              <Image src={client.logoUrl} alt={client.name} fill sizes="56px" className="object-cover" />
            ) : (
              client.name.charAt(0)
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
              {client.color}
              {!client.active && (
                <Badge variant="outline" className="ml-1">
                  Inactivo
                </Badge>
              )}
            </div>
            <h1 className="text-lg font-semibold text-foreground">{client.name}</h1>
          </div>
        </div>
        <ClientFormDialog
          client={client}
          trigger={
            <Button variant="outline" size="sm" className="gap-1.5">
              <Pencil className="size-3.5" />
              Editar cliente
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Calendarios</h2>
          <CalendarFormDialog
            lockedClient={client}
            trigger={
              <Button size="sm" className="gap-1.5">
                <Plus />
                Nuevo calendario
              </Button>
            }
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Todavía no hay calendarios. Creá el primero con &quot;Nuevo calendario&quot;.
                  </TableCell>
                </TableRow>
              )}
              {calendars.map((calendar) => (
                <TableRow key={calendar.id}>
                  <TableCell className="font-medium text-foreground">{calendar.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {MONTH_LABELS[calendar.month - 1]} {calendar.year}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {publicationCountByCalendarId[calendar.id] ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{CALENDAR_STATUS_LABELS[calendar.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/admin/calendars/${calendar.id}`} />}
                      >
                        Abrir
                      </Button>
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
