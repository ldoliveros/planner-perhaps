"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, Pencil, Plus, Power, PowerOff, Send, Trash2 } from "lucide-react";
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
import { CalendarRowActions } from "@/components/admin/calendar-row-actions";
import { CARD_ACTIONS_CLASS, EmptyCard, ResponsiveList, RowCard } from "@/components/admin/responsive-list";
import { ClientAccountFormDialog } from "@/components/admin/client-account-form-dialog";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { getContrastTextColor } from "@/lib/color-contrast";
import { CALENDAR_STATUS_LABELS } from "@/lib/calendar-labels";
import { deleteClient, setClientActive } from "@/lib/actions/clients";
import { deleteClientAccount, setClientAccountActive } from "@/lib/actions/client-accounts";
import { deleteClientUser } from "@/lib/actions/client-users";
import { toast } from "@/lib/toast";
import { ClientUserFormDialog } from "@/components/admin/client-user-form-dialog";
import { useResendInvitation } from "@/components/admin/resend-invitation-button";
import { RowActionsMenu } from "@/components/admin/row-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { UserAccessBadge } from "@/components/admin/user-access-badge";
import { accountLabel, accountSecondaryName } from "@/lib/account-label";
import type { AccountType, Calendar, Client, ClientAccount, ClientUser, Platform } from "@/types";
import { ClientTeamSection, type ClientTeamMember } from "@/components/admin/client-team-section";
import { ADMIN_SECTION_TITLE, ADMIN_SURFACE, ADMIN_TABLE_FRAME } from "@/lib/admin-surface";
import { cn } from "cn";

interface ClientDetailPageClientProps {
  client: Client;
  calendars: Calendar[];
  publicationCountByCalendarId: Record<string, number>;
  clientAccounts: ClientAccount[];
  usedAccountIds: string[];
  platforms: Platform[];
  accountTypes: AccountType[];
  clientUsers: ClientUser[];
  canEditClient: boolean;
  /** v1.6: miembros activos del equipo para "Equipo asignado". Solo Super Admin (null = la sección no se muestra). */
  teamMembers: ClientTeamMember[] | null;
}

export function ClientDetailPageClient({
  client,
  calendars,
  publicationCountByCalendarId,
  clientAccounts,
  usedAccountIds,
  platforms,
  accountTypes,
  clientUsers,
  canEditClient,
  teamMembers,
}: ClientDetailPageClientProps) {
  const platformMap = new Map(platforms.map((p) => [p.id, p]));
  const accountTypeMap = new Map(accountTypes.map((a) => [a.id, a]));
  const usedAccountIdSet = new Set(usedAccountIds);
  const activeCalendars = calendars.filter((c) => c.status !== "archived");
  const archivedCalendars = calendars.filter((c) => c.status === "archived");
  return (
    <div className={cn("flex min-h-full flex-col gap-8 p-6", ADMIN_SURFACE)}>
      {/* v1.6: encabezado sin tarjeta — volver, identidad del cliente (nombre con más protagonismo) y acciones a la
          derecha, separado de las secciones por un divisor sutil. */}
      <div className="flex flex-col gap-4 border-b border-border pb-6">
      <Link
        href="/admin/clients"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
      >
        <ArrowLeft className="size-4" />
        Clientes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl leading-none font-semibold [container-type:size]"
            style={
              client.logoUrl
                ? undefined
                : { backgroundColor: client.color, color: getContrastTextColor(client.color) }
            }
          >
            {client.logoUrl ? (
              <Image src={client.logoUrl} alt={client.name} fill sizes="64px" className="object-cover" />
            ) : (
              <span style={{ fontSize: "50cqmin" }}>{client.name.charAt(0)}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{client.name}</h1>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
              {client.color}
              {!client.active && (
                <Badge variant="outline" className="ml-1">
                  Archivado
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            nativeButton={false}
            render={<Link href={`/admin/clients/${client.id}/planner`} />}
          >
            <CalendarDays className="size-3.5" />
            Ver planner
          </Button>
          {canEditClient && (
            <ClientFormDialog
              client={client}
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Pencil className="size-3.5" />
                  Editar cliente
                </Button>
              }
            />
          )}
          {canEditClient && <ClientArchiveActions client={client} calendarCount={calendars.length} />}
        </div>
      </div>
      </div>

      {/* v1.6: secciones en dos columnas de igual ancho en desktop (Calendarios | Cuentas / Canales, luego Equipo
          asignado | Usuarios), alineadas arriba sin igualar alturas; una columna en tablet y mobile, en ese mismo orden
          de lectura. min-w-0: las tablas se ajustan al ancho de su columna (truncando) en vez de ensanchar la página. */}
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className={ADMIN_SECTION_TITLE}>Calendarios</h2>
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

        <CalendarsSubTable
          client={client}
          calendars={activeCalendars}
          publicationCountByCalendarId={publicationCountByCalendarId}
          emptyMessage='Todavía no hay calendarios. Creá el primero con "Nuevo calendario".'
        />

        {archivedCalendars.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Archivados</h3>
            <CalendarsSubTable
              client={client}
              calendars={archivedCalendars}
              publicationCountByCalendarId={publicationCountByCalendarId}
              emptyMessage=""
            />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className={ADMIN_SECTION_TITLE}>Cuentas / Canales</h2>
          <ClientAccountFormDialog clientId={client.id} platforms={platforms} accountTypes={accountTypes} />
        </div>

        <ResponsiveList
          table={
            <div className={ADMIN_TABLE_FRAME}>
              <Table className={SECTION_TABLE_CLASS}>
                <SectionColGroup widths={[null, null, "w-[96px]", "w-[84px]", "w-[48px]"]} />
                <TableHeader>
                  <TableRow>
                    <TableHead>Handle</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <ActionsHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientAccounts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center whitespace-normal text-muted-foreground">
                        {ACCOUNTS_EMPTY}
                      </TableCell>
                    </TableRow>
                  )}
                  {clientAccounts.map((account) => (
                    <ClientAccountRow
                      key={account.id}
                      layout="table"
                      clientId={client.id}
                      account={account}
                      isUsed={usedAccountIdSet.has(account.id)}
                      platform={platformMap.get(account.platformId)}
                      accountType={account.accountTypeId ? accountTypeMap.get(account.accountTypeId) : undefined}
                      platforms={platforms}
                      accountTypes={accountTypes}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          cards={
            <>
              {clientAccounts.length === 0 && <EmptyCard>{ACCOUNTS_EMPTY}</EmptyCard>}
              {clientAccounts.map((account) => (
                <ClientAccountRow
                  key={account.id}
                  layout="card"
                  clientId={client.id}
                  account={account}
                  isUsed={usedAccountIdSet.has(account.id)}
                  platform={platformMap.get(account.platformId)}
                  accountType={account.accountTypeId ? accountTypeMap.get(account.accountTypeId) : undefined}
                  platforms={platforms}
                  accountTypes={accountTypes}
                />
              ))}
            </>
          }
        />
      </div>

      {teamMembers && (
        <div className="min-w-0">
          <ClientTeamSection clientId={client.id} members={teamMembers} />
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className={ADMIN_SECTION_TITLE}>Usuarios</h2>
          <ClientUserFormDialog clientId={client.id} />
        </div>

        <ResponsiveList
          table={
            <div className={ADMIN_TABLE_FRAME}>
              <Table className={SECTION_TABLE_CLASS}>
                <SectionColGroup widths={["w-[40%]", null, "w-[92px]", "w-[96px]", "w-[48px]"]} />
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Fecha de alta</TableHead>
                    <TableHead>Estado</TableHead>
                    <ActionsHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center whitespace-normal text-muted-foreground">
                        {USERS_EMPTY}
                      </TableCell>
                    </TableRow>
                  )}
                  {clientUsers.map((user) => (
                    <ClientUserRow key={user.id} layout="table" clientId={client.id} user={user} canResendInvitation={canEditClient} />
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          cards={
            <>
              {clientUsers.length === 0 && <EmptyCard>{USERS_EMPTY}</EmptyCard>}
              {clientUsers.map((user) => (
                <ClientUserRow key={user.id} layout="card" clientId={client.id} user={user} canResendInvitation={canEditClient} />
              ))}
            </>
          }
        />
      </div>
      </div>
    </div>
  );
}

/**
 * Tablas de la ficha (v1.6, media columna en desktop): ancho fijo por columna con los textos largos truncados (con
 * `title`), las secundarias acotadas y las acciones reducidas a "Ver" + "•••" (Calendarios) o solo "•••". Por debajo
 * de `min-w` la tabla se desplaza dentro de su propio marco, nunca la página.
 */
const SECTION_TABLE_CLASS = "table-fixed min-w-[440px]";

const ACCOUNTS_EMPTY = <>Todavía no hay cuentas configuradas. Agregá la primera con &quot;Agregar cuenta&quot;.</>;
const USERS_EMPTY = <>Todavía no hay usuarios invitados. Invitá al primero con &quot;Invitar cliente&quot;.</>;

/** Anchos de columna (`null` = flexible). */
function SectionColGroup({ widths }: { widths: (string | null)[] }) {
  return (
    <colgroup>
      {widths.map((width, i) => (
        <col key={i} className={width ?? undefined} />
      ))}
    </colgroup>
  );
}

/** Columna de acciones: el encabezado queda para lectores de pantalla (el "•••" ya se explica solo). */
function ActionsHead() {
  return (
    <TableHead className="text-right">
      <span className="sr-only">Acciones</span>
    </TableHead>
  );
}

function CalendarsSubTable({
  client,
  calendars,
  publicationCountByCalendarId,
  emptyMessage,
}: {
  client: Client;
  calendars: Calendar[];
  publicationCountByCalendarId: Record<string, number>;
  emptyMessage: string;
}) {
  return (
    <ResponsiveList
      table={
        <div className={ADMIN_TABLE_FRAME}>
          <Table className={SECTION_TABLE_CLASS}>
            <SectionColGroup widths={[null, "w-[104px]", "w-[96px]", "w-[104px]"]} />
            <TableHeader>
              <TableRow>
                <TableHead>Calendario</TableHead>
                <TableHead>Publicaciones</TableHead>
                <TableHead>Estado</TableHead>
                <ActionsHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendars.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center whitespace-normal text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
              {calendars.map((calendar) => (
                <TableRow key={calendar.id}>
                  <TableCell className="truncate font-medium text-foreground" title={calendar.name}>{calendar.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {publicationCountByCalendarId[calendar.id] ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{CALENDAR_STATUS_LABELS[calendar.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <CalendarRowActions
                      client={client}
                      calendar={calendar}
                      publicationCount={publicationCountByCalendarId[calendar.id] ?? 0}
                      compact
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      }
      cards={
        <>
          {calendars.length === 0 && emptyMessage && <EmptyCard>{emptyMessage}</EmptyCard>}
          {calendars.map((calendar) => {
            const publicationCount = publicationCountByCalendarId[calendar.id] ?? 0;
            return (
              <RowCard key={calendar.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium text-foreground">{calendar.name}</span>
                    {calendar.description && (
                      <span className="line-clamp-2 text-xs text-muted-foreground">{calendar.description}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {publicationCount} publicaci{publicationCount === 1 ? "ón" : "ones"}
                    </span>
                  </div>
                  <Badge variant="outline">{CALENDAR_STATUS_LABELS[calendar.status]}</Badge>
                </div>
                <div className={CARD_ACTIONS_CLASS}>
                  <CalendarRowActions
                    client={client}
                    calendar={calendar}
                    publicationCount={publicationCount}
                    className="justify-start"
                    compact
                  />
                </div>
              </RowCard>
            );
          })}
        </>
      }
    />
  );
}

function ClientArchiveActions({ client, calendarCount }: { client: Client; calendarCount: number }) {
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
        toast.error(client.active ? "No se pudo archivar" : "No se pudo restaurar", result.error);
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
    <>
      <Button variant="outline" size="sm" className="gap-1.5" disabled={isArchiving} onClick={handleToggleActive}>
        {client.active ? <Archive className="size-3.5" /> : <ArchiveRestore className="size-3.5" />}
        {client.active ? "Archivar" : "Restaurar"}
      </Button>
      {!client.active && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5 text-destructive" />}>
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
  );
}

function ClientUserRow({
  layout,
  clientId,
  user,
  canResendInvitation,
}: {
  layout: "table" | "card";
  clientId: string;
  user: ClientUser;
  canResendInvitation: boolean;
}) {
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

  const createdAt = new Date(user.createdAt).toLocaleDateString("es-AR");
  const statusBadge = user.accessStatus ? <UserAccessBadge status={user.accessStatus} /> : null;
  const { resend, isPending: isResending } = useResendInvitation(user.id);
  // v1.6: acciones en el menú "•••" (mismos nombres y comportamiento); Eliminar abre su confirmación de siempre.
  const actions = (
    <>
      <RowActionsMenu label={`Más acciones de ${user.email ?? "este usuario"}`}>
        {canResendInvitation && user.accessStatus === "invited" && (
          <DropdownMenuItem disabled={isResending} onClick={resend}>
            <Send />
            {isResending ? "Enviando..." : "Reenviar invitación"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 />
          Eliminar
        </DropdownMenuItem>
      </RowActionsMenu>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
    </>
  );

  if (layout === "card") {
    return (
      <RowCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium break-all text-foreground">{user.email}</span>
            <span className="text-xs text-muted-foreground">
              {user.fullName ?? "Sin nombre"} · Alta {createdAt}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {statusBadge}
            {actions}
          </div>
        </div>
      </RowCard>
    );
  }

  return (
    <TableRow>
      <TableCell className="truncate font-medium text-foreground" title={user.email ?? undefined}>{user.email}</TableCell>
      <TableCell className="truncate text-muted-foreground">{user.fullName ?? "—"}</TableCell>
      <TableCell className="truncate text-muted-foreground">{createdAt}</TableCell>
      <TableCell>{statusBadge}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end">{actions}</div>
      </TableCell>
    </TableRow>
  );
}

function ClientAccountRow({
  layout,
  clientId,
  account,
  isUsed,
  platform,
  accountType,
  platforms,
  accountTypes,
}: {
  layout: "table" | "card";
  clientId: string;
  account: ClientAccount;
  isUsed: boolean;
  platform: Platform | undefined;
  accountType: AccountType | undefined;
  platforms: Platform[];
  accountTypes: AccountType[];
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggleActive() {
    startTransition(async () => {
      const result = await setClientAccountActive(account.id, clientId, !account.active);
      if (result.error) {
        toast.error("No se pudo actualizar la cuenta", result.error);
        return;
      }
      router.refresh();
      toast.success(account.active ? "Cuenta desactivada" : "Cuenta activada");
    });
  }

  function handleConfirmDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteClientAccount(account.id, clientId);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      toast.success("Cuenta eliminada");
    });
  }

  const statusBadge = <Badge variant={account.active ? "secondary" : "outline"}>{account.active ? "Activa" : "Inactiva"}</Badge>;
  // v1.6: acciones en el menú "•••" (mismos nombres y comportamiento); Editar abre el diálogo de siempre y Eliminar
  // su confirmación, ambos fuera del menú.
  const actions = (
    <>
      <RowActionsMenu label={`Más acciones de ${accountLabel(account)}`}>
        <DropdownMenuItem onClick={() => setEditOpen(true)}>
          <Pencil />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isPending} onClick={toggleActive}>
          {account.active ? <PowerOff /> : <Power />}
          {account.active ? "Desactivar" : "Activar"}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 />
          Eliminar
        </DropdownMenuItem>
      </RowActionsMenu>
      <ClientAccountFormDialog
        clientId={clientId}
        platforms={platforms}
        accountTypes={accountTypes}
        account={account}
        trigger={null}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la cuenta &quot;{accountLabel(account)}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {isUsed
                ? "Esta cuenta fue utilizada en publicaciones y no puede eliminarse. Desactivala en su lugar para conservar el historial."
                : "Esta acción es irreversible. Esta cuenta nunca fue utilizada en ninguna publicación."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>{isUsed ? "Entendido" : "Cancelar"}</AlertDialogCancel>
            {!isUsed && (
              <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleConfirmDelete}>
                Eliminar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (layout === "card") {
    // Handle principal; nombre (si existe y no es redundante), plataforma y tipo como línea secundaria.
    const secondary = [accountSecondaryName(account), platform?.name, accountType?.name].filter(Boolean).join(" · ");
    return (
      <RowCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 font-medium text-foreground">
              {platform && (
                <PlatformIcon platformKey={platform.key} className="size-4 shrink-0" style={{ color: platform.color }} />
              )}
              <span className="truncate">{accountLabel(account)}</span>
            </span>
            {secondary && <span className="truncate text-xs text-muted-foreground">{secondary}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {statusBadge}
            {actions}
          </div>
        </div>
      </RowCard>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">
        <div className="flex items-center gap-2">
          {platform && (
            <PlatformIcon platformKey={platform.key} className="size-4 shrink-0" style={{ color: platform.color }} />
          )}
          <span className="truncate" title={account.handle}>{accountLabel(account)}</span>
        </div>
      </TableCell>
      <TableCell className="truncate text-muted-foreground" title={account.name ?? undefined}>
        {account.name ?? "—"}
      </TableCell>
      <TableCell className="truncate text-muted-foreground">{accountType?.name ?? "—"}</TableCell>
      <TableCell>{statusBadge}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end">{actions}</div>
      </TableCell>
    </TableRow>
  );
}
