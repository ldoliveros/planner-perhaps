"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AuthBrandHeader } from "@/components/auth/auth-brand-header";
import { AuthSecondaryLink } from "@/components/auth/auth-secondary-link";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, signIn, type AuthActionState, type PasswordResetState } from "@/lib/actions/auth";

const initialSignInState: AuthActionState = { error: null };
const initialResetState: PasswordResetState = { error: null, sentAt: null };

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  return (
    <AuthSplitLayout>
      <AuthBrandHeader />
      {mode === "signin" ? (
        <SignInForm onForgotPassword={() => setMode("forgot")} />
      ) : (
        <ForgotPasswordForm onBack={() => setMode("signin")} />
      )}
      <AuthSecondaryLink question="¿Sos cliente?" label="Acceso clientes" href="/client/login" />
    </AuthSplitLayout>
  );
}

function SignInForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const [state, formAction, isPending] = useActionState(signIn, initialSignInState);

  return (
    <>
      <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-foreground">Acceso al equipo</h1>
      <p className="mt-3 text-sm text-muted-foreground">Ingresá con tu cuenta de Perhaps.</p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="nombre@perhaps.com.ar"
            autoComplete="email"
            required
            autoFocus
            className="h-11 rounded-xl px-3.5"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-11 rounded-xl px-3.5"
          />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button
          type="submit"
          disabled={isPending}
          className="h-11 rounded-xl bg-[#26a9e0] text-white hover:bg-[#1c8fc0] disabled:opacity-60"
        >
          {isPending ? "Ingresando..." : "Ingresar"}
        </Button>

        <button
          type="button"
          onClick={onForgotPassword}
          className="text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </button>
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
      <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-foreground">Recuperar acceso</h1>
      <p className="mt-3 text-sm text-muted-foreground">Te mandamos un link para elegir una nueva contraseña.</p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            name="email"
            type="email"
            placeholder="nombre@perhaps.com.ar"
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
          className="text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Volver a ingresar
        </button>
      </form>
    </>
  );
}
