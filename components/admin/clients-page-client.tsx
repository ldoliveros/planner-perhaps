"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarDays, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarFormDialog } from "@/components/admin/calendar-form-dialog";
import { CalendarRowActions } from "@/components/admin/calendar-row-actions";
import { ClientFormDialog } from "@/components/admin/client-form-dialog";
import { CARD_ACTIONS_CLASS, EmptyCard, ResponsiveList, RowCard } from "@/components/admin/responsive-list";
import { ActiveStatusBadge } from "@/components/shared/active-status-badge";
import { InactiveStatusBadge } from "@/components/shared/inactive-status-badge";
import { deleteClient, setClientActive } from "@/lib/actions/clients";
import { CALENDAR_STATUS_LABELS } from "@/lib/calendar-labels";
import { getContrastTextColor } from "@/lib/color-contrast";
import { toast } from "@/lib/toast";
import { cn } from "cn";
import type { Calendar, Client } from "@/types";

interface ClientsPageClientProps {
  clients: Client[];
  calendars: Calendar[];
  publicationCountByCalendarId: Record<string, number>;
  canCreateClients: boolean;
}

export function ClientsPageClient({ clients, calendars, publicationCountByCalendarId, canCreateClients }: ClientsPageClientProps) {
  const calendarsByClientId = new Map<string, Calendar[]>();
  for (const calendar of calendars) {
    const list = calendarsByClientId.get(calendar.clientId) ?? [];
    list.push(calendar);
    calendarsByClientId.set(calendar.clientId, list);
  }

  const activeClients = clients.filter((c) => c.active);
  const archivedClients = clients.filter((c) => !c.active);

  // Acordeón de apertura única para todo Clientes (incluye ambas secciones, activos y desactivados).
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  function toggleExpand(clientId: string) {
    setExpandedClientId((current) => (current === clientId ? null : clientId));
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
        {canCreateClients && <ClientFormDialog />}
      </div>

      <ClientsTable
        clients={activeClients}
        calendarsByClientId={calendarsByClientId}
        publicationCountByCalendarId={publicationCountByCalendarId}
        canManage={canCreateClients}
        expandedClientId={expandedClientId}
        onToggleExpand={toggleExpand}
        emptyMessage={
          canCreateClients
            ? <>Todavía no hay clientes. Creá el primero con &quot;Nuevo cliente&quot;.</>
            : "Todavía no tenés clientes asignados."
        }
      />

      {archivedClients.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Desactivados</h2>
          <ClientsTable
            clients={archivedClients}
            calendarsByClientId={calendarsByClientId}
            publicationCountByCalendarId={publicationCountByCalendarId}
            canManage={canCreateClients}
            expandedClientId={expandedClientId}
            onToggleExpand={toggleExpand}
            emptyMessage={null}
          />
        </div>
      )}
    </div>
  );
}

function ClientsTable({
  clients,
  calendarsByClientId,
  publicationCountByCalendarId,
  canManage,
  expandedClientId,
  onToggleExpand,
  emptyMessage,
}: {
  clients: Client[];
  calendarsByClientId: Map<string, Calendar[]>;
  publicationCountByCalendarId: Record<string, number>;
  canManage: boolean;
  expandedClientId: string | null;
  onToggleExpand: (clientId: string) => void;
  emptyMessage: React.ReactNode;
}) {
  return (
    <ResponsiveList
      table={
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Calendarios</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.length === 0 && emptyMessage && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
              {clients.map((client) => (
                <ClientRow
                  key={client.id}
                  layout="table"
                  client={client}
                  calendars={calendarsByClientId.get(client.id) ?? []}
                  publicationCountByCalendarId={publicationCountByCalendarId}
                  canManage={canManage}
                  expanded={expandedClientId === client.id}
                  onToggleExpand={() => onToggleExpand(client.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      }
      cards={
        <>
          {clients.length === 0 && emptyMessage && <EmptyCard>{emptyMessage}</EmptyCard>}
          {clients.map((client) => (
            <ClientRow
              key={client.id}
              layout="card"
              client={client}
              calendars={calendarsByClientId.get(client.id) ?? []}
              publicationCountByCalendarId={publicationCountByCalendarId}
              canManage={canManage}
              expanded={expandedClientId === client.id}
              onToggleExpand={() => onToggleExpand(client.id)}
            />
          ))}
        </>
      }
    />
  );
}

/** Estado (Activo verde reutilizable / resto con el Badge existente). */
function CalendarStatusBadge({ status }: { status: Calendar["status"] }) {
  if (status === "active") return <ActiveStatusBadge />;
  if (status === "archived") return <InactiveStatusBadge label={CALENDAR_STATUS_LABELS.archived} />;
  return <Badge variant="outline">{CALENDAR_STATUS_LABELS[status]}</Badge>;
}

/** Una fila de cliente: tabla en md+ (`layout="table"`) o card en < md (`layout="card"`); misma lógica y acciones.
 * Incluye el acordeón de sus calendarios (contraído por default), reutilizando CalendarRowActions/CalendarFormDialog
 * existentes en vez de reimplementar el CRUD de calendarios acá. */
function ClientRow({
  layout,
  client,
  calendars,
  publicationCountByCalendarId,
  canManage,
  expanded,
  onToggleExpand,
}: {
  layout: "table" | "card";
  client: Client;
  calendars: Calendar[];
  publicationCountByCalendarId: Record<string, number>;
  canManage: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isArchiving, startArchiveTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const calendarCount = calendars.length;
  const canDelete = !client.active && calendarCount === 0;

  function handleToggleActive() {
    startArchiveTransition(async () => {
      const result = await setClientActive(client.id, !client.active);
      if (result.error) {
        toast.error(client.active ? "No se pudo desactivar" : "No se pudo activar", result.error);
        return;
      }
      router.refresh();
      toast.success(client.active ? "Cliente desactivado" : "Cliente activado");
    });
  }

  function handleConfirmDelete() {
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteClient(client.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      toast.success("Cliente eliminado");
    });
  }

  const logo = (sizeClass: string, sizes: string) => (
    <span
      className={`relative flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold`}
      style={client.logoUrl ? undefined : { backgroundColor: client.color, color: getContrastTextColor(client.color) }}
    >
      {client.logoUrl ? (
        <Image src={client.logoUrl} alt="" fill sizes={sizes} className="object-cover" />
      ) : (
        client.name.charAt(0)
      )}
    </span>
  );
  const statusBadge = client.active ? <ActiveStatusBadge /> : <InactiveStatusBadge label="Desactivado" />;
  const calendarCountLabel = `${calendarCount} calendario${calendarCount === 1 ? "" : "s"}`;

  const expandToggle = (
    <button
      type="button"
      onClick={onToggleExpand}
      aria-expanded={expanded}
      aria-label={expanded ? "Contraer calendarios" : "Expandir calendarios"}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
    </button>
  );

  const actions = (
    <>
      <Button size="sm" className="gap-1.5" nativeButton={false} render={<Link href={`/admin/clients/${client.id}/planner`} />}>
        <CalendarDays className="size-3.5" />
        Ver planner
      </Button>
      <Button variant="ghost" size="sm" className="gap-1.5" nativeButton={false} render={<Link href={`/admin/clients/${client.id}`} />}>
        <Pencil className="size-3.5" />
        Editar
      </Button>
      {canManage && (
        <>
          <Button variant="ghost" size="sm" className="gap-1.5" disabled={isArchiving} onClick={handleToggleActive}>
            {client.active ? <Archive className="size-3.5" /> : <ArchiveRestore className="size-3.5" />}
            {client.active ? "Desactivar" : "Activar"}
          </Button>
          {!client.active && (
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-destructive" />}>
                <Trash2 className="size-3.5" />
                Eliminar definitivamente
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar el cliente &quot;{client.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {canDelete
                      ? "Esta acción es irreversible. El cliente no tiene calendarios ni historial asociado."
                      : `Este cliente tiene ${calendarCount} calendario${calendarCount === 1 ? "" : "s"} con historial y no puede eliminarse definitivamente. Podés mantenerlo desactivado para conservarlo.`}
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
        </>
      )}
    </>
  );

  const newCalendarTrigger = (
    <Button type="button" variant="outline" size="sm" className="gap-1.5">
      <Plus className="size-3.5" />
      Nuevo calendario
    </Button>
  );

  if (layout === "card") {
    return (
      <RowCard>
        <div className="flex items-center justify-between gap-3">
          {expandToggle}
          <Link href={`/admin/clients/${client.id}/planner`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
            {logo("size-10", "40px")}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">{client.name}</span>
              <span className="text-xs text-muted-foreground">{calendarCountLabel}</span>
            </span>
          </Link>
          {statusBadge}
        </div>
        {expanded && (
          <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2">
            {calendars.map((calendar) => {
              const publicationCount = publicationCountByCalendarId[calendar.id] ?? 0;
              return (
                <div
                  key={calendar.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                >
                  <Link
                    href={`/admin/clients/${client.id}/planner?calendars=${calendar.id}`}
                    className="flex min-w-0 items-center gap-1.5 text-sm text-foreground hover:underline"
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
                    <span className="truncate">{calendar.name}</span>
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {publicationCount} publicaci{publicationCount === 1 ? "ón" : "ones"}
                    </span>
                    <CalendarStatusBadge status={calendar.status} />
                    <CalendarRowActions client={client} calendar={calendar} publicationCount={publicationCount} compact />
                  </div>
                </div>
              );
            })}
            <div className="pt-1.5">
              <CalendarFormDialog lockedClient={client} trigger={newCalendarTrigger} />
            </div>
          </div>
        )}
        <div className={CARD_ACTIONS_CLASS}>{actions}</div>
      </RowCard>
    );
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-2">
            {expandToggle}
            <Link href={`/admin/clients/${client.id}/planner`} className="flex items-center gap-2 hover:underline">
              {logo("size-8", "32px")}
              <span className="font-medium text-foreground">{client.name}</span>
            </Link>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">{calendarCountLabel}</TableCell>
        <TableCell>{statusBadge}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">{actions}</div>
        </TableCell>
      </TableRow>
      {expanded &&
        calendars.map((calendar) => {
          const publicationCount = publicationCountByCalendarId[calendar.id] ?? 0;
          return (
            <TableRow key={calendar.id} className="bg-muted/40 hover:bg-muted/40">
              <TableCell className="py-2 pl-10">
                <Link
                  href={`/admin/clients/${client.id}/planner?calendars=${calendar.id}`}
                  className="flex items-center gap-2 text-sm text-foreground hover:underline"
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
                  {calendar.name}
                </Link>
              </TableCell>
              <TableCell className="py-2 text-sm text-muted-foreground">
                {publicationCount} publicaci{publicationCount === 1 ? "ón" : "ones"}
              </TableCell>
              <TableCell className="py-2">
                <CalendarStatusBadge status={calendar.status} />
              </TableCell>
              <TableCell className="py-2 text-right">
                <CalendarRowActions client={client} calendar={calendar} publicationCount={publicationCount} compact />
              </TableCell>
            </TableRow>
          );
        })}
      {expanded && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={4} className="pt-3 pb-3 pl-10">
            <CalendarFormDialog lockedClient={client} trigger={newCalendarTrigger} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
