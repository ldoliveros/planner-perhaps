"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, signIn, type AuthActionState, type PasswordResetState } from "@/lib/actions/auth";

const initialSignInState: AuthActionState = { error: null };
const initialResetState: PasswordResetState = { error: null, sentAt: null };

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-foreground">Planificador Editorial</h1>
        {mode === "signin" ? (
          <SignInForm onForgotPassword={() => setMode("forgot")} />
        ) : (
          <ForgotPasswordForm onBack={() => setMode("signin")} />
        )}
      </div>
    </div>
  );
}

function SignInForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const [state, formAction, isPending] = useActionState(signIn, initialSignInState);

  return (
    <>
      <p className="mb-6 text-sm text-muted-foreground">Ingresá con tu cuenta de administrador.</p>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" disabled={isPending} className="mt-2">
          {isPending ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
    </>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
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
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="size-8 text-primary" />
        <p className="text-sm font-medium text-foreground">Revisá tu email</p>
        <p className="text-sm text-muted-foreground">
          Te enviamos un link para elegir una nueva contraseña. Puede tardar unos minutos.
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onBack}>
          Volver a ingresar
        </Button>
      </div>
    );
  }

  return (
    <>
      <p className="mb-6 text-sm text-muted-foreground">Te mandamos un link para elegir una nueva contraseña.</p>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-email">Email</Label>
          <Input id="reset-email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" disabled={isPending} className="mt-2">
          {isPending ? "Enviando..." : "Enviar link"}
        </Button>
        <button type="button" onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Volver a ingresar
        </button>
      </form>
    </>
  );
}
