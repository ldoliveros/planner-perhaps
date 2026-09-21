"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/shared/user-avatar";
import { signOut } from "@/lib/actions/auth";
import { cn } from "cn";

interface UserMenuProps {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  profileHref: string;
  signOutRedirectTo: string;
  /** Solo variant="sidebar": label humano de rol mostrado bajo el nombre. */
  roleLabel?: string;
  /** "header" (default, uso actual en /admin y /client) o "sidebar" (pie del sidebar oscuro). */
  variant?: "header" | "sidebar";
  /** Solo variant="sidebar": sidebar colapsado -> mostrar únicamente el avatar. */
  collapsed?: boolean;
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
}: UserMenuProps) {
  const isSidebar = variant === "sidebar";

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
                : "shrink-0 px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <UserAvatar fullName={fullName} email={email} avatarUrl={avatarUrl} size={isSidebar ? 30 : 20} />
            {isSidebar && !collapsed && (
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-white">{fullName || email}</span>
                {roleLabel && <span className="truncate text-[11px] text-white/50">{roleLabel}</span>}
              </span>
            )}
            {!isSidebar && <span className="hidden sm:inline">{fullName || email}</span>}
          </button>
        }
      />
      <PopoverContent align={isSidebar ? "start" : "end"} side={isSidebar ? "top" : "bottom"} className="w-56 gap-1 p-1.5">
        <div className="flex items-center gap-2 border-b border-border px-2 py-2">
          <UserAvatar fullName={fullName} email={email} avatarUrl={avatarUrl} size={32} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{fullName || "Sin nombre"}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </div>
        </div>
        <Link
          href={profileHref}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 pointer-coarse:min-h-11 text-sm text-foreground hover:bg-muted"
        >
          <User className="size-3.5" />
          Mi perfil
        </Link>
        <form action={signOut.bind(null, signOutRedirectTo)}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pointer-coarse:min-h-11 text-left text-sm text-foreground hover:bg-muted"
          >
            <LogOut className="size-3.5" />
            Cerrar sesión
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
