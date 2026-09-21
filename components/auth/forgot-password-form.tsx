"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type PasswordResetState } from "@/lib/actions/auth";

const initialResetState: PasswordResetState = { error: null, sentAt: null };

/** Recuperar/crear contraseña por email (pantalla de acceso única /login); solo para usuarios existentes. */
export function ForgotPasswordForm({ onBack, placeholder }: { onBack: () => void; placeholder: string }) {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialResetState);
  const [sent, setSent] = useState(false);
  const lastSentAt = useRef<number | null>(null);

  useEffect(() => {
    if (state.sentAt && state.sentAt !== lastSentAt.current) {
      lastSentAt.current = state.sentAt;
      setSent(true);
    }
  }, [state.sentAt]);

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-2 py-2">
        <CheckCircle2 className="size-8 text-[#26a9e0]" />
        <p className="text-lg font-semibold text-foreground">Revisá tu email</p>
        <p className="text-sm text-muted-foreground">
          Te enviamos un link para elegir una nueva contraseña. Puede tardar unos minutos.
        </p>
        <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={onBack}>
          Volver a ingresar
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-foreground">Recuperar contraseña</h1>
      <p className="mt-3 text-sm text-muted-foreground">Te mandamos un link para elegir una nueva contraseña.</p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            name="email"
            type="email"
            placeholder={placeholder}
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
          {isPending ? "Enviando..." : "Enviar link"}
        </Button>
        <button
          type="button"
          onClick={onBack}
          className="text-center text-xs text-muted-foreground hover:text-foreground hover:underline pointer-coarse:min-h-11"
        >
          Volver a ingresar
        </button>
      </form>
    </>
  );
}
