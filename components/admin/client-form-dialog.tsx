"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import Image from "next/image";
import { Building2, Plus } from "lucide-react";
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
import { toast } from "@/lib/toast";
import type { Client } from "@/types";

const INITIAL_STATE: ClientFormState = { error: null, savedAt: null };

interface ClientFormDialogProps {
  client?: Client;
  trigger?: React.ReactElement;
}

export function ClientFormDialog({ client, trigger }: ClientFormDialogProps) {
  const [open, setOpen] = useState(false);
  // Se incrementa cada vez que el diálogo se abre, para remontar ClientFormBody
  // (útil: si un guardado anterior falló, el error/campos no quedan pegados).
  const [sessionKey, setSessionKey] = useState(0);

  function handleOpenChange(next: boolean) {
    if (next) setSessionKey((k) => k + 1);
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
        <ClientFormBody key={sessionKey} client={client} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ClientFormBody({ client, onDone }: { client?: Client; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(saveClient, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);

  const [name, setName] = useState(client?.name ?? "");
  const [color, setColor] = useState(client?.color ?? "#16A34A");
  const [active, setActive] = useState(client?.active ?? true);
  const [driveFolderUrl, setDriveFolderUrl] = useState(client?.driveFolderUrl ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(client?.logoUrl ?? null);

  const isValidHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      onDone();
      toast.success(client ? "Cliente guardado" : "Cliente creado");
    }
  }, [state.savedAt, onDone, client]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setLogoPreview(URL.createObjectURL(file));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {client && <input type="hidden" name="id" value={client.id} />}

      <div className="flex items-center gap-3">
        <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {logoPreview ? (
            <Image src={logoPreview} alt="" fill sizes="56px" className="object-cover" />
          ) : (
            <Building2 className="size-5 text-muted-foreground/50" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="logo">Logo</Label>
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            onChange={handleLogoChange}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="color">Color principal</Label>
          <input
            id="color"
            type="color"
            value={isValidHex ? color : "#16A34A"}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
          />
        </div>
        <Input
          name="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#16A34A"
          className="font-mono uppercase"
          maxLength={7}
        />
        <label className="mb-1.5 flex shrink-0 items-center gap-2 text-sm text-foreground">
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
  );
}
