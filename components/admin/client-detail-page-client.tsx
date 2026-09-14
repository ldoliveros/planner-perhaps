"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
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
import { CalendarFormDialog } from "@/components/admin/calendar-form-dialog";
import { ClientAccountFormDialog } from "@/components/admin/client-account-form-dialog";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { getContrastTextColor } from "@/lib/color-contrast";
import { CALENDAR_STATUS_LABELS } from "@/lib/calendar-labels";
import { deleteCalendar } from "@/lib/actions/calendars";
import { setClientAccountActive } from "@/lib/actions/client-accounts";
import { deleteClientUser } from "@/lib/actions/client-users";
import { toast } from "@/lib/toast";
import { ClientUserFormDialog } from "@/components/admin/client-user-form-dialog";
import type { AccountType, Calendar, Client, ClientAccount, ClientUser, Platform } from "@/types";

interface ClientDetailPageClientProps {
  client: Client;
  calendars: Calendar[];
  publicationCountByCalendarId: Record<string, number>;
  clientAccounts: ClientAccount[];
  platforms: Platform[];
  accountTypes: AccountType[];
  clientUsers: ClientUser[];
}

export function ClientDetailPageClient({
  client,
  calendars,
  publicationCountByCalendarId,
  clientAccounts,
  platforms,
  accountTypes,
  clientUsers,
}: ClientDetailPageClientProps) {
  const platformMap = new Map(platforms.map((p) => [p.id, p]));
  const accountTypeMap = new Map(accountTypes.map((a) => [a.id, a]));
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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            nativeButton={false}
            render={<Link href={`/admin/clients/${client.id}/planner`} />}
          >
            <CalendarDays className="size-3.5" />
            Ver planner
          </Button>
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
                <TableHead>Publicaciones</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendars.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Todavía no hay calendarios. Creá el primero con &quot;Nuevo calendario&quot;.
                  </TableCell>
                </TableRow>
              )}
              {calendars.map((calendar) => (
                <CalendarTableRow
                  key={calendar.id}
                  client={client}
                  calendar={calendar}
                  publicationCount={publicationCountByCalendarId[calendar.id] ?? 0}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Cuentas / Canales</h2>
          <ClientAccountFormDialog clientId={client.id} platforms={platforms} accountTypes={accountTypes} />
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientAccounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Todavía no hay cuentas configuradas. Agregá la primera con &quot;Agregar cuenta&quot;.
                  </TableCell>
                </TableRow>
              )}
              {clientAccounts.map((account) => (
                <ClientAccountTableRow
                  key={account.id}
                  clientId={client.id}
                  account={account}
                  platform={platformMap.get(account.platformId)}
                  accountType={account.accountTypeId ? accountTypeMap.get(account.accountTypeId) : undefined}
                  platforms={platforms}
                  accountTypes={accountTypes}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Usuarios</h2>
          <ClientUserFormDialog clientId={client.id} />
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Invitado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Todavía no hay usuarios invitados. Invitá al primero con &quot;Invitar usuario&quot;.
                  </TableCell>
                </TableRow>
              )}
              {clientUsers.map((user) => (
                <ClientUserTableRow key={user.id} clientId={client.id} user={user} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function CalendarTableRow({
  client,
  calendar,
  publicationCount,
}: {
  client: Client;
  calendar: Calendar;
  publicationCount: number;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirmDelete() {
    setError(null);
    startTransition(async () => {
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
    <TableRow>
      <TableCell className="font-medium text-foreground">{calendar.name}</TableCell>
      <TableCell className="text-muted-foreground">{publicationCount}</TableCell>
      <TableCell>
        <Badge variant="outline">{CALENDAR_STATUS_LABELS[calendar.status]}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/clients/${client.id}/planner?calendars=${calendar.id}`} />}
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
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger
              render={<Button variant="ghost" size="sm" className="gap-1.5 text-destructive" />}
            >
              <Trash2 className="size-3.5" />
              Eliminar
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar el calendario &quot;{calendar.name}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>
                  {publicationCount > 0
                    ? `Esta acción no se puede deshacer. Se eliminarán también las ${publicationCount} publicación${publicationCount === 1 ? "" : "es"} de este calendario.`
                    : "Esta acción no se puede deshacer."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleConfirmDelete}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ClientUserTableRow({ clientId, user }: { clientId: string; user: ClientUser }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteClientUser(user.id, clientId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      toast.success("Usuario eliminado");
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{user.email}</TableCell>
      <TableCell className="text-muted-foreground">{user.fullName ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{new Date(user.createdAt).toLocaleDateString("es-AR")}</TableCell>
      <TableCell className="text-right">
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-destructive" />}>
            <Trash2 className="size-3.5" />
            Eliminar
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar a &quot;{user.email}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. La cuenta pierde el acceso inmediatamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleConfirmDelete}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

function ClientAccountTableRow({
  clientId,
  account,
  platform,
  accountType,
  platforms,
  accountTypes,
}: {
  clientId: string;
  account: ClientAccount;
  platform: Platform | undefined;
  accountType: AccountType | undefined;
  platforms: Platform[];
  accountTypes: AccountType[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await setClientAccountActive(account.id, clientId, !account.active);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      toast.success(account.active ? "Cuenta desactivada" : "Cuenta activada");
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">
        <div className="flex items-center gap-2">
          {platform && (
            <PlatformIcon platformKey={platform.key} className="size-4 shrink-0" style={{ color: platform.color }} />
          )}
          {account.name}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{account.handle ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{accountType?.name ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={account.active ? "outline" : "secondary"}>{account.active ? "Activa" : "Inactiva"}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {error && <span className="self-center text-xs text-destructive">{error}</span>}
          <Button variant="ghost" size="sm" disabled={isPending} onClick={toggleActive}>
            {account.active ? "Desactivar" : "Activar"}
          </Button>
          <ClientAccountFormDialog
            clientId={clientId}
            platforms={platforms}
            accountTypes={accountTypes}
            account={account}
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
}
