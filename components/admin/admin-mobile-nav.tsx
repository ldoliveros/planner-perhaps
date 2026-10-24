"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { PlannerLogo } from "@/components/branding/planner-logo";
import {
  getAdminManageItems,
  HOME_ITEM,
  type AdminNavItem,
} from "@/components/admin/admin-nav-items";
import { AdminSpacesNav, useAdminSpaceNav, type AdminSpace } from "@/components/admin/admin-spaces-nav";
import { AdminHeaderActions } from "@/components/admin/admin-account";
import { APP_VERSION } from "@/lib/version";
import { cn } from "cn";

interface AdminMobileNavProps {
  role: "super_admin" | "account_manager";
  spaces: AdminSpace[];
}

export function AdminMobileNav({ role, spaces }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const manageItems = getAdminManageItems(role);
  const { manageClientsActive } = useAdminSpaceNav();

  // Cierra el panel ante cualquier cambio de ruta (link del menú, "Mi perfil", botón atrás), no solo al
  // tocar un ítem de navegación. Se ajusta durante el render (patrón de React) en vez de un effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  function renderItem(item: AdminNavItem, active: boolean) {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 pointer-coarse:py-3 text-sm font-medium transition-colors",
          active ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/90"
        )}
      >
        <Icon className="size-[18px] shrink-0" />
        {item.label}
      </Link>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border bg-white px-3 py-2 pointer-coarse:py-1 md:hidden">
        <Button variant="ghost" size="icon-sm" aria-label="Abrir navegación" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
        <Link href="/admin" aria-label="Planner by Perhaps" className="flex items-center py-1.5 pointer-coarse:py-2.5">
          <PlannerLogo variant="full" height={26} />
        </Link>
        <AdminHeaderActions className="ml-auto" />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 gap-0 border-none bg-[#111318] p-0 sm:max-w-72" showCloseButton={false}>
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <div className="flex items-center gap-2 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 text-white">
            <PlannerLogo variant="negative" height={30} />
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar navegación"
                  className="-mr-2 ml-auto text-white/70 hover:bg-white/10 hover:text-white"
                />
              }
            >
              <X />
            </SheetClose>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 px-3">
            {renderItem(HOME_ITEM, pathname === HOME_ITEM.href)}
            {/* Un espacio abre el Planner del cliente; el panel se cierra al tocarlo (y también por el cambio de ruta). */}
            <AdminSpacesNav spaces={spaces} variant="sheet" onNavigate={() => setOpen(false)} />
            {manageItems.map((item) =>
              renderItem(item, item.href === "/admin/clients" ? manageClientsActive : Boolean(pathname?.startsWith(item.href)))
            )}
          </nav>
          <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Link
              href="/changelog"
              onClick={() => setOpen(false)}
              className="mt-1.5 block truncate rounded-md px-2 py-1 pointer-coarse:py-2.5 text-center text-[10px] text-white/25 transition-colors hover:text-white/60"
            >
              Planner by Perhaps · v{APP_VERSION}
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
