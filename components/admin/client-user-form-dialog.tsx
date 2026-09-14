"use client";

import { useEffect, useRef, useState } from "react";
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
import { inviteClientUser, type InviteClientUserState } from "@/lib/actions/client-users";
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
            Invitar usuario
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoFocus />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Nombre (opcional)</Label>
        <Input id="fullName" name="fullName" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enviando..." : "Enviar invitación"}
        </Button>
      </DialogFooter>
    </form>
  );
}
