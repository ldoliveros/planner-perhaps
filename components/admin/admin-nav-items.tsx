import { Building2, CalendarDays, Newspaper, Users, type LucideIcon } from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const BASE_ITEMS: AdminNavItem[] = [
  { href: "/admin/clients", label: "Clientes", icon: Building2 },
  { href: "/admin/calendars", label: "Calendarios", icon: CalendarDays },
  { href: "/admin/publications", label: "Publicaciones", icon: Newspaper },
];

const TEAM_ITEM: AdminNavItem = { href: "/admin/team", label: "Equipo", icon: Users };

/** Misma navegación permitida hoy: Equipo solo para Super Admin. */
export function getAdminNavItems(role: "super_admin" | "account_manager"): AdminNavItem[] {
  return role === "super_admin" ? [...BASE_ITEMS, TEAM_ITEM] : BASE_ITEMS;
}
