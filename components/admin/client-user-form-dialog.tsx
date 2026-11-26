"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  inviteClientUser,
  setClientUserPublicationPermission,
  type InviteClientUserState,
} from "@/lib/actions/client-users";
import { toast } from "@/lib/toast";

const INITIAL_STATE: InviteClientUserState = { error: null, savedAt: null };

interface ClientUserFormDialogProps {
  clientId: string;
}

export function ClientUserFormDialog({ clientId }: ClientUserFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  function handleOpenChange(next: boolean) {
    if (next) setSessionKey((k) => k + 1);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus />
            Invitar cliente
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar cliente</DialogTitle>
        </DialogHeader>
        <ClientUserFormBody key={sessionKey} clientId={clientId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ClientUserFormBody({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(inviteClientUser, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const router = useRouter();
  const [canEditPublications, setCanEditPublications] = useState(false);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      router.refresh();
      onDone();
      toast.success("Invitación enviada");
    }
  }, [state.savedAt, onDone, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cu-firstName">Nombre</Label>
          <Input id="cu-firstName" name="firstName" required autoFocus autoComplete="given-name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cu-lastName">Apellido (opcional)</Label>
          <Input id="cu-lastName" name="lastName" autoComplete="family-name" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <input type="hidden" name="canEditPublications" value={canEditPublications ? "on" : ""} />
      <PublicationPermissionField id="cu-canEdit" checked={canEditPublications} onCheckedChange={setCanEditPublications} />

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enviando..." : "Enviar invitación"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Etiqueta visible del permiso por cliente de un Client User. */
export function publicationPermissionLabel(canEditPublications: boolean): string {
  return canEditPublications ? "Editor" : "Lector";
}

function PublicationPermissionField({
  id,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border p-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          Permitir crear y editar publicaciones
        </Label>
        <p className="text-xs text-muted-foreground">
          Editor: crea y edita publicaciones de este cliente. No puede eliminarlas, archivarlas ni administrar el cliente.
          Sin marcar: Lector.
        </p>
      </div>
    </div>
  );
}

/** Editar el permiso Lector / Editor de un Client User existente (Super Admin). */
export function ClientUserPermissionDialog({
  open,
  onOpenChange,
  clientId,
  userId,
  userLabel,
  canEditPublications,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  userId: string;
  userLabel: string;
  canEditPublications: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(canEditPublications);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setChecked(canEditPublications);
      setError(null);
    }
    onOpenChange(next);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await setClientUserPublicationPermission(userId, clientId, checked);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
      toast.success(`Permiso actualizado: ${publicationPermissionLabel(checked)}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar permiso</DialogTitle>
        </DialogHeader>
        <p className="text-sm break-all text-muted-foreground">{userLabel}</p>
        <PublicationPermissionField id={`cu-perm-${userId}`} checked={checked} onCheckedChange={setChecked} disabled={isPending} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" onClick={handleSave} disabled={isPending || checked === canEditPublications}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
