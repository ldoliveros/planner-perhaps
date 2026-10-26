"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Layers } from "lucide-react";
import { PUBLICATIONS_HREF } from "@/components/admin/admin-nav-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

/** Espacio = cliente visible para el usuario (RLS: Super Admin todos, Account Manager solo los asignados). */
export interface AdminSpace {
  id: string;
  name: string;
  color: string;
}

/** Ruta del Planner individual de un cliente: la misma que usa "Administrar clientes" para entrar a él. */
export function clientPlannerHref(clientId: string): string {
  return `/admin/clients/${clientId}/planner`;
}

const CLIENT_PLANNER_PATH = /^\/admin\/clients\/([^/]+)\/planner\/?$/;

/**
 * Navegación por espacios (v1.6). Un espacio abre el Planner individual del cliente (pantalla existente, con su
 * propio encabezado, calendarios y filtros); el activo se deduce de la ruta real, no de un estado propio.
 */
export function useAdminSpaceNav() {
  const pathname = usePathname();
  const activeSpaceId = pathname ? (CLIENT_PLANNER_PATH.exec(pathname)?.[1] ?? null) : null;
  return {
    publicationsActive: pathname === PUBLICATIONS_HREF,
    activeSpaceId,
    // Administrar clientes: /admin/clients y sus pantallas, salvo el Planner de un cliente (ese es un espacio).
    manageClientsActive: Boolean(pathname?.startsWith("/admin/clients")) && activeSpaceId === null,
  };
}

interface AdminSpacesNavProps {
  spaces: AdminSpace[];
  /** sidebar: sidebar oscuro de desktop (respeta `collapsed`) · sheet: navegación mobile. */
  variant: "sidebar" | "sheet";
  collapsed?: boolean;
  onNavigate?: () => void;
}

/**
 * Sección desplegable "Espacios" del sidebar (desktop y mobile). v1.6: el primer elemento es "Ver todos" (el
 * calendario global, la ruta existente /admin/publications — antes "Publicaciones" como ítem aparte); debajo, el
 * Planner de cada cliente.
 */
export function AdminSpacesNav({ spaces, variant, collapsed = false, onNavigate }: AdminSpacesNavProps) {
  const [open, setOpen] = useState(true);
  const { activeSpaceId, publicationsActive } = useAdminSpaceNav();
  const sheet = variant === "sheet";

  // Compacto (68px): el ícono lleva a "Ver todos"; al pasar el mouse el sidebar se expande y muestra la lista.
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={PUBLICATIONS_HREF}
              aria-label="Espacios: ver todos"
              className={cn(
                "flex items-center justify-center rounded-lg py-2.5 transition-colors",
                activeSpaceId || publicationsActive ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/90"
              )}
            />
          }
        >
          <Layers className="size-[18px] shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="right">Espacios</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2.5 rounded-lg text-sm font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white/90",
          sheet ? "gap-3 px-3 py-2.5 pointer-coarse:py-3" : "px-2.5 py-2"
        )}
      >
        <Layers className="size-[18px] shrink-0" />
        <span className="flex-1 truncate text-left">Espacios</span>
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <ul className="flex flex-col gap-0.5">
          <li>
            <Link
              href={PUBLICATIONS_HREF}
              onClick={onNavigate}
              aria-current={publicationsActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg pr-2.5 text-sm transition-colors",
                sheet ? "py-2 pl-10 pointer-coarse:py-2.5" : "py-1.5 pl-9",
                publicationsActive ? "bg-white/10 font-medium text-white" : "text-white/55 hover:bg-white/5 hover:text-white/90"
              )}
            >
              <span aria-hidden className="flex size-2 shrink-0 items-center justify-center rounded-full border border-current" />
              <span className="truncate">Ver todos</span>
            </Link>
          </li>
          {spaces.length === 0 && (
            <li className={cn("py-1.5 text-xs text-white/35", sheet ? "pl-10" : "pl-9")}>No tenés espacios asignados.</li>
          )}
          {spaces.map((space) => {
            const active = space.id === activeSpaceId;
            return (
              <li key={space.id}>
                <Link
                  href={clientPlannerHref(space.id)}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg pr-2.5 text-sm transition-colors",
                    sheet ? "py-2 pl-10 pointer-coarse:py-2.5" : "py-1.5 pl-9",
                    active ? "bg-white/10 font-medium text-white" : "text-white/55 hover:bg-white/5 hover:text-white/90"
                  )}
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: space.color }} />
                  <span className="truncate">{space.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
