"use client";

import { Search, X } from "lucide-react";
import { cn } from "cn";

interface PublicationSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Buscador compacto (ícono + input), reemplaza el buscador grande que tenía Publicaciones. Mismo componente en
 * Publicaciones (Semana/Mes/Lista) y en el Planner de cliente (Semana/Mes/Lista) — siempre visible, integrado
 * a la altura de los selects de filtro, no un bloque aparte que domine la barra.
 */
export function PublicationSearchBox({ value, onChange, className }: PublicationSearchBoxProps) {
  return (
    <div className={cn("relative w-full max-w-64 shrink-0", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar..."
        aria-label="Buscar publicaciones"
        className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-7 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
