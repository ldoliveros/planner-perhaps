"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAccessBadge } from "@/components/admin/user-access-badge";
import { ActiveStatusBadge } from "@/components/shared/active-status-badge";
import { InactiveStatusBadge } from "@/components/shared/inactive-status-badge";
import { ACCESS_STATUS_LABELS } from "@/lib/user-access";
import { EmptyCard, ResponsiveList, RowCard } from "@/components/admin/responsive-list";
import { TeamMemberCreateDialog, TeamMemberEditDialog } from "@/components/admin/team-member-form-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ROLE_LABELS } from "@/lib/role-labels";
import { ADMIN_ACTIONS_RESERVE } from "@/lib/admin-shell";
import { ADMIN_PAGE_TITLE, ADMIN_SURFACE, ADMIN_TABLE_FRAME } from "@/lib/admin-surface";
import { cn } from "cn";
import type { TeamMember, UserAccessStatus } from "@/types";

const MAX_VISIBLE_CLIENT_CHIPS = 3;

interface TeamPageClientProps {
  members: TeamMember[];
}

export function TeamPageClient({ members }: TeamPageClientProps) {
  return (
    <div className={cn("flex min-h-full flex-col gap-5 p-6", ADMIN_SURFACE)}>
      {/* Reserva el lugar de la campanita + avatar del layout (ver lib/admin-shell.ts). */}
      <div className={cn("flex items-center justify-between", ADMIN_ACTIONS_RESERVE)}>
        <h1 className={ADMIN_PAGE_TITLE}>Equipo</h1>
        <TeamMemberCreateDialog />
      </div>

      <ResponsiveList
        table={
          <div className={ADMIN_TABLE_FRAME}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Clientes asignados</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      {EMPTY_MESSAGE}
                    </TableCell>
                  </TableRow>
                )}
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <UserAvatar fullName={member.fullName} email={member.email} avatarUrl={member.avatarUrl} size={24} />
                        {member.fullName ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <AssignedClients member={member} />
                    </TableCell>
                    <TableCell>
                      <TeamStatusBadge status={member.accessStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <TeamMemberEditDialog member={member} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        }
        cards={
          <>
            {members.length === 0 && <EmptyCard>{EMPTY_MESSAGE}</EmptyCard>}
            {members.map((member) => (
              <RowCard key={member.id}>
                <div className="flex items-start gap-3">
                  <UserAvatar fullName={member.fullName} email={member.email} avatarUrl={member.avatarUrl} size={40} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-foreground">{member.fullName ?? member.email}</span>
                    {member.fullName && <span className="truncate text-xs text-muted-foreground">{member.email}</span>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                      <TeamStatusBadge status={member.accessStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Clientes asignados</span>
                  <AssignedClients member={member} />
                </div>
                <div className="flex justify-end [&_button]:pointer-coarse:h-11">
                  <TeamMemberEditDialog member={member} />
                </div>
              </RowCard>
            ))}
          </>
        }
      />
    </div>
  );
}

const EMPTY_MESSAGE = (
  <>Todavía no hay usuarios internos. Creá el primero con &quot;Nuevo usuario&quot;.</>
);

/** Clientes asignados de un miembro del equipo (chips; los Super Admin ven todos los clientes). */
function AssignedClients({ member }: { member: TeamMember }) {
  if (member.role === "super_admin") {
    return <span className="text-xs text-muted-foreground">Todos los clientes</span>;
  }
  if (member.assignedClients.length === 0) {
    return <span className="text-xs text-muted-foreground">Sin clientes asignados</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {member.assignedClients.slice(0, MAX_VISIBLE_CLIENT_CHIPS).map((client) => (
        <Badge key={client.id} variant="secondary" className="text-xs">
          {client.name}
        </Badge>
      ))}
      {member.assignedClients.length > MAX_VISIBLE_CLIENT_CHIPS && (
        <span className="text-xs text-muted-foreground">+{member.assignedClients.length - MAX_VISIBLE_CLIENT_CHIPS} más</span>
      )}
    </div>
  );
}

/**
 * Estado en Equipo (v1.6): mismos pills que Clientes — Activo (verde) y Desactivado (rojo) con punto. "Invitado" no
 * tiene equivalente en Clientes y conserva el badge de acceso de siempre.
 */
function TeamStatusBadge({ status }: { status: UserAccessStatus }) {
  if (status === "active") return <ActiveStatusBadge />;
  if (status === "disabled") return <InactiveStatusBadge label={ACCESS_STATUS_LABELS.disabled} />;
  return <UserAccessBadge status={status} />;
}
