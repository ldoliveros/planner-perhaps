"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const BASE_NAV_ITEMS = [
  { href: "/admin/clients", label: "Clientes" },
  { href: "/admin/calendars", label: "Calendarios" },
  { href: "/admin/publications", label: "Publicaciones" },
];

interface AdminNavProps {
  role: "super_admin" | "account_manager";
}

export function AdminNav({ role }: AdminNavProps) {
  const pathname = usePathname();
  const items =
    role === "super_admin" ? [...BASE_NAV_ITEMS, { href: "/admin/team", label: "Equipo" }] : BASE_NAV_ITEMS;

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
