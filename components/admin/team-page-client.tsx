"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAccessBadge } from "@/components/admin/user-access-badge";
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
                  Todavía no hay usuarios internos. Creá el primero con &quot;Nuevo usuario&quot;.
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
                  {member.role === "super_admin" ? (
                    <span className="text-xs text-muted-foreground">Todos los clientes</span>
                  ) : member.assignedClients.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Sin clientes asignados</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {member.assignedClients.slice(0, MAX_VISIBLE_CLIENT_CHIPS).map((client) => (
                        <Badge key={client.id} variant="secondary" className="text-xs">
                          {client.name}
                        </Badge>
                      ))}
                      {member.assignedClients.length > MAX_VISIBLE_CLIENT_CHIPS && (
                        <span className="text-xs text-muted-foreground">
                          +{member.assignedClients.length - MAX_VISIBLE_CLIENT_CHIPS} más
                        </span>
                      )}
                    </div>
                  )}
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
    </div>
  );
}
