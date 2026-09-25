"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ROLE_LABELS } from "@/lib/role-labels";
import type { ClientMember } from "@/types";

const MAX_VISIBLE = 4;
const AVATAR_SIZE = 26;

interface AvatarStackProps {
  members: ClientMember[];
}

/** Integrantes con acceso a un cliente (header del Planner de cliente): avatares superpuestos, hasta
 * MAX_VISIBLE, con "+N" para el resto. Tooltip con nombre + rol; fallback a inicial (UserAvatar). */
export function AvatarStack({ members }: AvatarStackProps) {
  if (members.length === 0) return null;
  const visible = members.slice(0, MAX_VISIBLE);
  const hidden = members.length - visible.length;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((member) => {
        const label = member.fullName || member.email || "Sin nombre";
        return (
          <Tooltip key={member.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`${label} — ${ROLE_LABELS[member.role]}`}
                  className="relative rounded-full ring-2 ring-background transition-transform hover:z-10 hover:-translate-y-0.5"
                />
              }
            >
              <UserAvatar fullName={member.fullName} email={member.email} avatarUrl={member.avatarUrl} size={AVATAR_SIZE} />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {label} · {ROLE_LABELS[member.role]}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {hidden > 0 && (
        <span
          className="relative flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
          aria-label={`${hidden} integrantes más`}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}
