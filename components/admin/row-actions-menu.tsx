"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Menú "•••" de acciones secundarias de una fila (v1.6): mismo componente en Clientes y en la ficha del cliente.
 * Ícono discreto alineado a la derecha; el menú se abre en un portal (sin recortes por el overflow de las tablas), se
 * maneja con teclado y se cierra al elegir una acción. Las acciones destructivas abren su confirmación de siempre
 * (AlertDialog controlado por la fila, fuera del menú).
 */
export function RowActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground data-[popup-open]:bg-muted data-[popup-open]:text-foreground"
            aria-label={label}
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
