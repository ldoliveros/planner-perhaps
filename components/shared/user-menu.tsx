"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/shared/user-avatar";
import { signOut } from "@/lib/actions/auth";

interface UserMenuProps {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  profileHref: string;
  signOutRedirectTo: string;
}

export function UserMenu({ email, fullName, avatarUrl, profileHref, signOutRedirectTo }: UserMenuProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <UserAvatar fullName={fullName} email={email} avatarUrl={avatarUrl} size={20} />
            <span className="hidden sm:inline">{fullName || email}</span>
          </button>
        }
      />
      <PopoverContent align="end" className="w-56 gap-1 p-1.5">
        <div className="flex items-center gap-2 border-b border-border px-2 py-2">
          <UserAvatar fullName={fullName} email={email} avatarUrl={avatarUrl} size={32} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{fullName || "Sin nombre"}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </div>
        </div>
        <Link
          href={profileHref}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
        >
          <User className="size-3.5" />
          Mi perfil
        </Link>
        <form action={signOut.bind(null, signOutRedirectTo)}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
          >
            <LogOut className="size-3.5" />
            Cerrar sesión
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
