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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveClientAccount, type ClientAccountFormState } from "@/lib/actions/client-accounts";
import { toast } from "@/lib/toast";
import type { AccountType, ClientAccount, Platform } from "@/types";

const INITIAL_STATE: ClientAccountFormState = { error: null, savedAt: null };
const NO_ACCOUNT_TYPE = "__none__";

interface ClientAccountFormDialogProps {
  clientId: string;
  platforms: Platform[];
  accountTypes: AccountType[];
  account?: ClientAccount;
  trigger?: React.ReactElement;
}

export function ClientAccountFormDialog({
  clientId,
  platforms,
  accountTypes,
  account,
  trigger,
}: ClientAccountFormDialogProps) {
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
          trigger ?? (
            <Button size="sm" className="gap-1.5">
              <Plus />
              Agregar cuenta
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
        </DialogHeader>
        <ClientAccountFormBody
          key={sessionKey}
          clientId={clientId}
          platforms={platforms}
          accountTypes={accountTypes}
          account={account}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ClientAccountFormBody({
  clientId,
  platforms,
  accountTypes,
  account,
  onDone,
}: {
  clientId: string;
  platforms: Platform[];
  accountTypes: AccountType[];
  account?: ClientAccount;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(saveClientAccount, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const router = useRouter();

  const [platformId, setPlatformId] = useState(account?.platformId ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [handle, setHandle] = useState(account?.handle ?? "");
  const [url, setUrl] = useState(account?.url ?? "");
  const [accountTypeId, setAccountTypeId] = useState(account?.accountTypeId ?? NO_ACCOUNT_TYPE);
  const [active, setActive] = useState(account?.active ?? true);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      router.refresh();
      onDone();
      toast.success(account ? "Cuenta guardada" : "Cuenta creada");
    }
  }, [state.savedAt, onDone, router, account]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {account && <input type="hidden" name="id" value={account.id} />}
      <input type="hidden" name="clientId" value={clientId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platformId">Plataforma / canal</Label>
        <Select
          name="platformId"
          value={platformId}
          onValueChange={(value) => setPlatformId(value as string)}
          items={Object.fromEntries(platforms.map((p) => [p.id, p.name]))}
        >
          <SelectTrigger id="platformId" className="w-full">
            <SelectValue placeholder="Elegí una plataforma" />
          </SelectTrigger>
          <SelectContent>
            {platforms.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre visible</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: AIonis Health"
          required
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="handle">Handle (opcional)</Label>
          <Input
            id="handle"
            name="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@aionis.health"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountTypeId">Tipo de cuenta (opcional)</Label>
          <Select
            name="accountTypeId"
            value={accountTypeId}
            onValueChange={(value) => setAccountTypeId(value as string)}
            items={{ [NO_ACCOUNT_TYPE]: "Sin especificar", ...Object.fromEntries(accountTypes.map((a) => [a.id, a.name])) }}
          >
            <SelectTrigger id="accountTypeId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ACCOUNT_TYPE}>Sin especificar</SelectItem>
              {accountTypes.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="url">URL (opcional)</Label>
        <Input
          id="url"
          name="url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://instagram.com/aionis.health"
        />
      </div>

      <label className="flex w-fit items-center gap-2 text-sm text-foreground">
        <Switch name="active" checked={active} onCheckedChange={setActive} />
        Activa
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
