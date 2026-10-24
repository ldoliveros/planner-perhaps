"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { cn } from "cn";

interface UserMenuProps {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  profileHref: string;
  signOutRedirectTo: string;
  /** variant="sidebar": label de rol bajo el nombre · variant="avatar": se muestra en el menú desplegable. */
  roleLabel?: string;
  /** "header" (default, portal del cliente: avatar + nombre), "sidebar" (pie del sidebar oscuro) o "avatar"
   * (v1.6, /admin: solo la foto — o la inicial — en el extremo superior derecho; mismo menú). */
  variant?: "header" | "sidebar" | "avatar";
  /** Solo variant="sidebar": sidebar colapsado -> mostrar únicamente el avatar. */
  collapsed?: boolean;
  /** Solo variant="avatar": escala del encabezado del Planner — 32 px exteriores, como su botón "+". */
  compact?: boolean;
}

export function UserMenu({
  email,
  fullName,
  avatarUrl,
  profileHref,
  signOutRedirectTo,
  roleLabel,
  variant = "header",
  collapsed = false,
  compact = false,
}: UserMenuProps) {
  const isSidebar = variant === "sidebar";
  const isAvatar = variant === "avatar";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-lg transition-colors",
              isSidebar
                ? cn(
                    "w-full text-left text-white/80 hover:bg-white/10",
                    collapsed ? "justify-center px-0 py-2" : "px-2 py-2"
                  )
                : isAvatar
                  ? compact
                    ? "size-8 shrink-0 justify-center rounded-full p-0 transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-11"
                    : "shrink-0 rounded-full p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  : "shrink-0 px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-label={isAvatar ? `Cuenta: ${fullName || email || "usuario"}` : undefined}
          >
            <UserAvatar fullName={fullName} email={email} avatarUrl={avatarUrl} size={isAvatar && compact ? 32 : isSidebar || isAvatar ? 30 : 20} />
            {isSidebar && !collapsed && (
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-white">{fullName || email}</span>
                {roleLabel && <span className="truncate text-[11px] text-white/50">{roleLabel}</span>}
              </span>
            )}
            {variant === "header" && <span className="hidden sm:inline">{fullName || email}</span>}
          </button>
        }
      />
      <PopoverContent align={isSidebar ? "start" : "end"} side={isSidebar ? "top" : "bottom"} className="w-56 gap-1 p-1.5">
        <div className="flex items-center gap-2 border-b border-border px-2 py-2">
          <UserAvatar fullName={fullName} email={email} avatarUrl={avatarUrl} size={32} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{fullName || "Sin nombre"}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
            {isAvatar && roleLabel && <span className="truncate text-[11px] text-muted-foreground">{roleLabel}</span>}
          </div>
        </div>
        <Link
          href={profileHref}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 pointer-coarse:min-h-11 text-sm text-foreground hover:bg-muted"
        >
          <User className="size-3.5" />
          Mi perfil
        </Link>
        <SignOutButton
          redirectTo={signOutRedirectTo}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pointer-coarse:min-h-11 text-left text-sm text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-70"
        >
          <LogOut className="size-3.5" />
          Cerrar sesión
        </SignOutButton>
      </PopoverContent>
    </Popover>
  );
}
