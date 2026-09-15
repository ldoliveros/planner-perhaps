"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarDays, Pencil, Trash2 } from "lucide-react";
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
import { ClientFormDialog } from "@/components/admin/client-form-dialog";
import { deleteClient, setClientActive } from "@/lib/actions/clients";
import { getContrastTextColor } from "@/lib/color-contrast";
import { toast } from "@/lib/toast";
import type { Client } from "@/types";

interface ClientsPageClientProps {
  clients: Client[];
  calendarCountByClientId: Record<string, number>;
  canCreateClients: boolean;
}

export function ClientsPageClient({ clients, calendarCountByClientId, canCreateClients }: ClientsPageClientProps) {
  const activeClients = clients.filter((c) => c.active);
  const archivedClients = clients.filter((c) => !c.active);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
        {canCreateClients && <ClientFormDialog />}
      </div>

      <ClientsTable
        clients={activeClients}
        calendarCountByClientId={calendarCountByClientId}
        canManage={canCreateClients}
        emptyMessage={
          canCreateClients
            ? <>Todavía no hay clientes. Creá el primero con &quot;Nuevo cliente&quot;.</>
            : "Todavía no tenés clientes asignados."
        }
      />

      {archivedClients.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Archivados</h2>
          <ClientsTable
            clients={archivedClients}
            calendarCountByClientId={calendarCountByClientId}
            canManage={canCreateClients}
            emptyMessage={null}
          />
        </div>
      )}
    </div>
  );
}

function ClientsTable({
  clients,
  calendarCountByClientId,
  canManage,
  emptyMessage,
}: {
  clients: Client[];
  calendarCountByClientId: Record<string, number>;
  canManage: boolean;
  emptyMessage: React.ReactNode;
}) {
  return (
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
            <ClientTableRow
              key={client.id}
              client={client}
              calendarCount={calendarCountByClientId[client.id] ?? 0}
              canManage={canManage}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ClientTableRow({
  client,
  calendarCount,
  canManage,
}: {
  client: Client;
  calendarCount: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isArchiving, startArchiveTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canDelete = !client.active && calendarCount === 0;

  function handleToggleActive() {
    startArchiveTransition(async () => {
      const result = await setClientActive(client.id, !client.active);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(client.active ? "Cliente archivado" : "Cliente restaurado");
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

  return (
    <TableRow>
      <TableCell>
        <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-2 hover:underline">
          <span
            className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold"
            style={
              client.logoUrl
                ? undefined
                : { backgroundColor: client.color, color: getContrastTextColor(client.color) }
            }
          >
            {client.logoUrl ? (
              <Image src={client.logoUrl} alt="" fill sizes="32px" className="object-cover" />
            ) : (
              client.name.charAt(0)
            )}
          </span>
          <span className="font-medium text-foreground">{client.name}</span>
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{calendarCount}</TableCell>
      <TableCell>
        <Badge variant={client.active ? "secondary" : "outline"}>{client.active ? "Activo" : "Inactivo"}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5" nativeButton={false} render={<Link href={`/admin/clients/${client.id}`} />}>
            <Pencil className="size-3.5" />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            nativeButton={false}
            render={<Link href={`/admin/clients/${client.id}/planner`} />}
          >
            <CalendarDays className="size-3.5" />
            Ver planner
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" className="gap-1.5" disabled={isArchiving} onClick={handleToggleActive}>
                {client.active ? <Archive className="size-3.5" /> : <ArchiveRestore className="size-3.5" />}
                {client.active ? "Archivar" : "Restaurar"}
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
                          : `Este cliente tiene ${calendarCount} calendario${calendarCount === 1 ? "" : "s"} con historial y no puede eliminarse definitivamente. Podés mantenerlo archivado para conservarlo.`}
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
        </div>
      </TableCell>
    </TableRow>
  );
}
