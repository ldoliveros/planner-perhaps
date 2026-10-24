"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { saveTeamMemberAssignments } from "@/lib/actions/team";
import { toast } from "@/lib/toast";
import { ADMIN_ROW_HOVER, ADMIN_SECTION_TITLE, ADMIN_TABLE_FRAME } from "@/lib/admin-surface";
import { cn } from "cn";

export interface ClientTeamMember {
  id: string;
  name: string;
  /** Todos los clientes asignados al miembro (no solo este): saveTeamMemberAssignments reemplaza la lista. */
  assignedClientIds: string[];
}

/**
 * "Equipo asignado" en la ficha del cliente (v1.6). Miembros internos activos (Super Admin y Account Manager) con
 * un switch de asignación a ESTE cliente. Usa el mecanismo existente de "Clientes asignados"
 * (saveTeamMemberAssignments sobre user_client_assignments): se envía la lista completa del miembro con este
 * cliente agregado o quitado, así sus asignaciones a otros clientes quedan intactas. Solo Super Admin (lo valida
 * también el servidor).
 */
export function ClientTeamSection({ clientId, members }: { clientId: string; members: ClientTeamMember[] }) {
  const router = useRouter();
  const [assigned, setAssigned] = useState(() => new Map(members.map((m) => [m.id, m.assignedClientIds])));
  // Después de router.refresh() llegan las asignaciones vigentes del servidor: mandan sobre el estado local.
  const [lastMembers, setLastMembers] = useState(members);
  if (members !== lastMembers) {
    setLastMembers(members);
    setAssigned(new Map(members.map((m) => [m.id, m.assignedClientIds])));
  }
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setPending(memberId: string, pending: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  }

  async function toggle(member: ClientTeamMember, assign: boolean) {
    const current = assigned.get(member.id) ?? [];
    const nextIds = assign ? Array.from(new Set([...current, clientId])) : current.filter((id) => id !== clientId);
    setAssigned((prev) => new Map(prev).set(member.id, nextIds));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[member.id];
      return next;
    });
    setPending(member.id, true);
    let error: string | null;
    try {
      error = (await saveTeamMemberAssignments(member.id, nextIds)).error;
    } catch {
      error = "No se pudo conectar con el servidor.";
    }
    setPending(member.id, false);
    if (error) {
      setAssigned((prev) => new Map(prev).set(member.id, current));
      setErrors((prev) => ({ ...prev, [member.id]: error }));
      toast.error("No se pudo guardar la asignación", error);
      return;
    }
    toast.success(assign ? `${member.name} asignado a este cliente` : `${member.name} quitado de este cliente`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className={ADMIN_SECTION_TITLE}>Equipo asignado</h2>
      <div className={ADMIN_TABLE_FRAME}>
        {members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay miembros activos del equipo.</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const isAssigned = (assigned.get(member.id) ?? []).includes(clientId);
              const pending = pendingIds.has(member.id);
              const error = errors[member.id];
              return (
                <li key={member.id} className={cn("flex flex-col gap-1 px-4 py-2", ADMIN_ROW_HOVER)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-foreground">{member.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {pending && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
                          <Loader2 className="size-3.5 animate-spin" />
                          Guardando...
                        </span>
                      )}
                      <Switch
                        checked={isAssigned}
                        disabled={pending}
                        onCheckedChange={(checked) => void toggle(member, checked)}
                        aria-label={`${isAssigned ? "Quitar a" : "Asignar a"} ${member.name}`}
                      />
                    </span>
                  </div>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
