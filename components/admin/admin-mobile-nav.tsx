"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { PerhapsIsologo } from "@/components/branding/perhaps-isologo";
import { getAdminNavItems } from "@/components/admin/admin-nav-items";
import { UserMenu } from "@/components/shared/user-menu";
import { ROLE_LABELS } from "@/lib/role-labels";
import { APP_VERSION } from "@/lib/version";
import { cn } from "cn";

interface AdminMobileNavProps {
  role: "super_admin" | "account_manager";
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

export function AdminMobileNav({ role, email, fullName, avatarUrl }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = getAdminNavItems(role);

  // Cierra el panel ante cualquier cambio de ruta (link del menú, "Mi perfil", botón atrás), no solo al
  // tocar un ítem de navegación. Se ajusta durante el render (patrón de React) en vez de un effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2 pointer-coarse:py-1 md:hidden">
        <Button variant="ghost" size="icon-sm" aria-label="Abrir navegación" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
        <Link href="/admin" className="flex items-center gap-1.5 py-2 text-foreground pointer-coarse:py-3">
          <PerhapsIsologo size={18} />
          <span className="text-sm font-bold tracking-tight">Perhaps.</span>
        </Link>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 gap-0 border-none bg-[#111318] p-0 sm:max-w-72" showCloseButton={false}>
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <div className="flex items-center gap-2 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-1 text-white">
            <PerhapsIsologo size={24} />
            <span className="text-lg font-bold tracking-tight">Perhaps.</span>
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
          <div className="px-5 pb-5 text-[10px] font-semibold tracking-[0.18em] text-white/40 uppercase">
            Planificador Editorial
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 px-3">
            {items.map((item) => {
              const active = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 pointer-coarse:py-3 text-sm font-medium transition-colors",
                    active ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/90"
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <UserMenu
              email={email}
              fullName={fullName}
              avatarUrl={avatarUrl}
              profileHref="/admin/profile"
              signOutRedirectTo="/login"
              roleLabel={ROLE_LABELS[role]}
              variant="sidebar"
            />
            <Link
              href="/changelog"
              onClick={() => setOpen(false)}
              className="mt-1.5 block truncate rounded-md px-2 py-1 pointer-coarse:py-2.5 text-center text-[10px] text-white/25 transition-colors hover:text-white/60"
            >
              Perhaps Planner · v{APP_VERSION}
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
