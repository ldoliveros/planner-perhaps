"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAccessBadge } from "@/components/admin/user-access-badge";
import { EmptyCard, ResponsiveList, RowCard } from "@/components/admin/responsive-list";
import { TeamMemberCreateDialog, TeamMemberEditDialog } from "@/components/admin/team-member-form-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ROLE_LABELS } from "@/lib/role-labels";
import type { Client, TeamMember } from "@/types";

const MAX_VISIBLE_CLIENT_CHIPS = 3;

interface TeamPageClientProps {
  members: TeamMember[];
  clients: Client[];
}

export function TeamPageClient({ members, clients }: TeamPageClientProps) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Equipo</h1>
        <TeamMemberCreateDialog clients={clients} />
      </div>

      <ResponsiveList
        table={
          <div className="overflow-hidden rounded-lg border border-border bg-card">
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
                      <UserAccessBadge status={member.accessStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <TeamMemberEditDialog member={member} clients={clients} />
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
                      <UserAccessBadge status={member.accessStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Clientes asignados</span>
                  <AssignedClients member={member} />
                </div>
                <div className="flex justify-end [&_button]:pointer-coarse:h-11">
                  <TeamMemberEditDialog member={member} clients={clients} />
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
