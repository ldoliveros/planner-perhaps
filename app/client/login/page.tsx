"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestMagicLink, type MagicLinkState } from "@/lib/actions/auth";

const initialState: MagicLinkState = { error: null, sentAt: null };

export default function ClientLoginPage() {
  const [state, formAction, isPending] = useActionState(requestMagicLink, initialState);
  const [sent, setSent] = useState(false);
  const lastSentAt = useRef<number | null>(null);

  useEffect(() => {
    if (state.sentAt && state.sentAt !== lastSentAt.current) {
      lastSentAt.current = state.sentAt;
      setSent(true);
    }
  }, [state.sentAt]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-foreground">Planificador Editorial</h1>
        <p className="mb-6 text-sm text-muted-foreground">Ingresá con el email de tu cuenta.</p>

        {sent ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="size-8 text-primary" />
            <p className="text-sm font-medium text-foreground">Revisá tu email</p>
            <p className="text-sm text-muted-foreground">Te enviamos un link para ingresar. Puede tardar unos minutos.</p>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>

            {state.error && <p className="text-sm text-destructive">{state.error}</p>}

            <Button type="submit" disabled={isPending} className="mt-2">
              {isPending ? "Enviando..." : "Enviar link de acceso"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
