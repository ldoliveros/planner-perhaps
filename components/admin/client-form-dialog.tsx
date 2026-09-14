"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveClient, type ClientFormState } from "@/lib/actions/clients";
import type { Client } from "@/types";

const INITIAL_STATE: ClientFormState = { error: null, savedAt: null };

interface ClientFormDialogProps {
  client?: Client;
  trigger?: React.ReactElement;
}

export function ClientFormDialog({ client, trigger }: ClientFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(saveClient, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);

  // Campos controlados: si no lo hacemos, una revalidación de datos que llegue
  // mientras el diálogo todavía está en la animación de cierre pisa el
  // defaultValue de un input no controlado y Base UI lo marca como error.
  const [name, setName] = useState(client?.name ?? "");
  const [color, setColor] = useState(client?.color ?? "#16A34A");
  const [active, setActive] = useState(client?.active ?? true);
  const [driveFolderUrl, setDriveFolderUrl] = useState(client?.driveFolderUrl ?? "");

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      setOpen(false);
    }
  }, [state.savedAt]);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(client?.name ?? "");
      setColor(client?.color ?? "#16A34A");
      setActive(client?.active ?? true);
      setDriveFolderUrl(client?.driveFolderUrl ?? "");
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm" className="gap-1.5">
              <Plus />
              Nuevo cliente
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{client ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {client && <input type="hidden" name="id" value={client.id} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                name="color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-16 p-1"
              />
            </div>
            <label className="mt-5 flex items-center gap-2 text-sm text-foreground">
              <Switch name="active" checked={active} onCheckedChange={setActive} />
              Activo
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="driveFolderUrl">Carpeta de Drive (opcional)</Label>
            <Input
              id="driveFolderUrl"
              name="driveFolderUrl"
              type="url"
              placeholder="https://drive.google.com/drive/folders/..."
              value={driveFolderUrl}
              onChange={(e) => setDriveFolderUrl(e.target.value)}
            />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
