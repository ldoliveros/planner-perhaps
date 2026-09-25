"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/shared/user-avatar";
import { getReadableTextColor } from "@/lib/color-contrast";
import type { ClientMember } from "@/types";

const MAX_VISIBLE = 4;
const AVATAR_SIZE = 26;

interface AvatarStackProps {
  members: ClientMember[];
  /** client.color: fondo del fallback de inicial (en vez del gris genérico). */
  clientColor: string;
}

/**
 * Integrantes con acceso a un cliente (header del Planner de cliente): avatares superpuestos, hasta
 * MAX_VISIBLE, con un botón "+N" que abre un Popover con TODOS los integrantes. En todo el componente
 * se muestra únicamente avatar/inicial + nombre — el rol existe en los datos pero no se renderiza acá.
 */
export function AvatarStack({ members, clientColor }: AvatarStackProps) {
  if (members.length === 0) return null;
  const visible = members.slice(0, MAX_VISIBLE);
  const hidden = members.length - visible.length;
  const initialTextColor = getReadableTextColor(clientColor);

  return (
    <div className="flex items-center -space-x-1">
      {visible.map((member) => {
        const label = member.fullName || member.email || "Sin nombre";
        return (
          <Tooltip key={member.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={label}
                  className="relative rounded-full ring-2 ring-background transition-transform hover:z-10 hover:-translate-y-0.5"
                />
              }
            >
              <UserAvatar
                fullName={member.fullName}
                email={member.email}
                avatarUrl={member.avatarUrl}
                size={AVATAR_SIZE}
                bgColor={clientColor}
                textColor={initialTextColor}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        );
      })}
      {hidden > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={`${hidden} integrantes más`}
                className="relative flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background transition-colors hover:bg-muted/70"
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              />
            }
          >
            +{hidden}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <div className="flex flex-col gap-1">
              {members.map((member) => {
                const label = member.fullName || member.email || "Sin nombre";
                return (
                  <div key={member.id} className="flex items-center gap-2 rounded-md px-1.5 py-1">
                    <UserAvatar
                      fullName={member.fullName}
                      email={member.email}
                      avatarUrl={member.avatarUrl}
                      size={28}
                      bgColor={clientColor}
                      textColor={initialTextColor}
                    />
                    <span className="truncate text-sm text-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
