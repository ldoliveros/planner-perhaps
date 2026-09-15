"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AuthBrandHeader } from "@/components/auth/auth-brand-header";
import { AuthSecondaryLink } from "@/components/auth/auth-secondary-link";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
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
    <AuthSplitLayout>
      <AuthBrandHeader />

      {sent ? (
        <div className="flex flex-col items-start gap-2 py-2">
          <CheckCircle2 className="size-8 text-[#26a9e0]" />
          <p className="text-lg font-semibold text-foreground">Revisá tu email</p>
          <p className="text-sm text-muted-foreground">
            Te enviamos un link para ingresar. Puede tardar unos minutos.
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-foreground">
            Accedé a tu calendario
            <br />
            de contenidos
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Te enviaremos un enlace seguro a tu email para ingresar.
          </p>

          <form action={formAction} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="nombre@empresa.com"
                autoComplete="email"
                required
                autoFocus
                className="h-11 rounded-xl px-3.5"
              />
            </div>

            {state.error && <p className="text-sm text-destructive">{state.error}</p>}

            <Button
              type="submit"
              disabled={isPending}
              className="h-11 rounded-xl bg-[#26a9e0] text-white hover:bg-[#1c8fc0] disabled:opacity-60"
            >
              {isPending ? "Enviando..." : "Enviarme link de acceso"}
            </Button>
          </form>
        </>
      )}

      <AuthSecondaryLink question="¿Sos parte del equipo?" label="Acceso administrador" href="/login" />
    </AuthSplitLayout>
  );
}
