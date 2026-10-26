"use client";

import type { Ref } from "react";
import { Search, X } from "lucide-react";
import { cn } from "cn";

interface PublicationSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
  /** Enter o clic en la lupa (v1.6, búsqueda global): el caller ejecuta la búsqueda. Con esto la lupa es un botón. */
  onSubmit?: (value: string) => void;
  /** "lg": campo principal de la página de búsqueda. */
  size?: "default" | "lg";
  placeholder?: string;
  /** Foco inicial del modal de búsqueda. */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Buscador compacto (ícono + input). v1.6: lo usa la página de búsqueda global (/admin/search, /client/search); el
 * encabezado del Planner solo muestra la lupa que lleva a esa página.
 */
export function PublicationSearchBox({
  value,
  onChange,
  className,
  autoFocus,
  onSubmit,
  size = "default",
  placeholder = "Buscar...",
  inputRef,
}: PublicationSearchBoxProps) {
  const large = size === "lg";
  const submit = () => {
    if (onSubmit && value.trim()) onSubmit(value.trim());
  };
  const iconClass = cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground", large ? "left-3 size-4" : "left-2.5 size-3.5");
  return (
    <div className={cn("relative w-full max-w-64 shrink-0", className)}>
      {onSubmit ? (
        <button
          type="button"
          onClick={submit}
          aria-label="Buscar"
          className={cn(
            "absolute top-1/2 left-1 flex -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            large ? "size-7" : "size-6"
          )}
        >
          <Search className={large ? "size-4" : "size-3.5"} />
        </button>
      ) : (
        <Search className={cn("pointer-events-none", iconClass)} />
      )}
      <input
        ref={inputRef}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !onSubmit || e.nativeEvent.isComposing) return;
          e.preventDefault();
          submit();
        }}
        enterKeyHint={onSubmit ? "search" : undefined}
        placeholder={placeholder}
        aria-label="Buscar publicaciones"
        className={cn(
          "w-full rounded-md border border-input bg-transparent shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden",
          large ? "h-9 rounded-lg pr-9 pl-10 text-base md:text-sm" : "h-8 pr-7 pl-8 text-sm pointer-coarse:h-9"
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className={cn(
            "absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground",
            large ? "right-2.5" : "right-1.5"
          )}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
