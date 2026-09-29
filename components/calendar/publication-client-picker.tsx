"use client";

import { useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Client } from "@/types";

interface PublicationClientPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  onSelect: (clientId: string) => void;
}

/**
 * Publicaciones (global): "Nueva publicación" no tiene un cliente fijo de antemano (a diferencia de
 * Editar/Duplicar, que lo resuelven de la publicación de origen) — este paso previo lo resuelve antes de
 * abrir PublicationView, que en los 3 modos siempre espera un clientId ya determinado.
 */
export function PublicationClientPicker({ open, onOpenChange, clients, onSelect }: PublicationClientPickerProps) {
  const [query, setQuery] = useState("");
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle>Nueva publicación</DialogTitle>
          <DialogDescription>Seleccioná el cliente para el que querés crear la publicación.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Buscar cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-semibold text-foreground">
                  {c.logoUrl ? (
                    <Image src={c.logoUrl} alt="" fill sizes="28px" className="object-cover" />
                  ) : (
                    c.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="truncate">{c.name}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
