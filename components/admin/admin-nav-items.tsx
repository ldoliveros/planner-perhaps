import { Building2, LayoutDashboard, Users, type LucideIcon } from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const HOME_HREF = "/admin";
/** Calendario global (ruta existente, para no romper enlaces): se abre desde Espacios → "Ver todos". */
export const PUBLICATIONS_HREF = "/admin/publications";

/** Primer ítem (v1.6): Escritorio, el dashboard de staff. */
export const HOME_ITEM: AdminNavItem = { href: HOME_HREF, label: "Escritorio", icon: LayoutDashboard };


const MANAGE_CLIENTS_ITEM: AdminNavItem = { href: "/admin/clients", label: "Administrar clientes", icon: Building2 };
const TEAM_ITEM: AdminNavItem = { href: "/admin/team", label: "Equipo", icon: Users };

/** Ítems después de Espacios. Misma navegación permitida hoy: Equipo solo para Super Admin. */
export function getAdminManageItems(role: "super_admin" | "account_manager"): AdminNavItem[] {
  return role === "super_admin" ? [MANAGE_CLIENTS_ITEM, TEAM_ITEM] : [MANAGE_CLIENTS_ITEM];
}
