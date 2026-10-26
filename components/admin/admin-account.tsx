"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserMenu } from "@/components/shared/user-menu";
import { ROLE_LABELS } from "@/lib/role-labels";
import { isPlannerPath } from "@/lib/admin-shell";
import { cn } from "cn";

export interface AdminAccount {
  role: "super_admin" | "account_manager";
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

const AdminAccountContext = createContext<AdminAccount | null>(null);

/** Datos de la cuenta de staff (los resuelve el layout de /admin) para las acciones de cuenta. */
export function AdminAccountProvider({ account, children }: { account: AdminAccount; children: ReactNode }) {
  return <AdminAccountContext.Provider value={account}>{children}</AdminAccountContext.Provider>;
}

/**
 * Campanita + avatar de la cuenta (v1.6). Se montan una sola vez por ubicación del layout de /admin: en desktop,
 * en el extremo superior derecho del contenido (ver ADMIN_ACTIONS_RESERVE); en mobile, en la barra superior.
 * El drawer de notificaciones y el menú de perfil son los de siempre.
 *
 * `floating` (la instancia de desktop): en las pantallas del Planner pasa a la escala compacta de su encabezado —
 * campanita de 28 px y avatar de 32 px (igual que el "+"; 44 en táctil), top 15 px — así comparten eje vertical con
 * Calendario/Tablero/Lista, ••• y "+". En el resto de /admin no cambia nada.
 */
export function AdminHeaderActions({ className, floating = false }: { className?: string; floating?: boolean }) {
  const account = useContext(AdminAccountContext);
  const pathname = usePathname();
  if (!account) return null;
  const compact = floating && isPlannerPath(pathname);
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className, compact && "top-[15px] gap-1.5")}>
      <NotificationBell variant="header" compact={compact} />
      <UserMenu
        compact={compact}
        variant="avatar"
        email={account.email}
        fullName={account.fullName}
        avatarUrl={account.avatarUrl}
        roleLabel={ROLE_LABELS[account.role]}
        profileHref="/admin/profile"
        signOutRedirectTo="/login"
      />
    </div>
  );
}
