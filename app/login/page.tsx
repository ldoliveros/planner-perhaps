"use client";

import { useActionState, useState } from "react";
import { AuthBrandHeader } from "@/components/auth/auth-brand-header";
import { AuthSecondaryLink } from "@/components/auth/auth-secondary-link";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { signIn, type AuthActionState } from "@/lib/actions/auth";

const initialSignInState: AuthActionState = { error: null };

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  return (
    <AuthSplitLayout>
      <AuthBrandHeader />
      {mode === "signin" ? (
        <SignInForm onForgotPassword={() => setMode("forgot")} />
      ) : (
        <ForgotPasswordForm onBack={() => setMode("signin")} placeholder="nombre@perhaps.com.ar" />
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
          <PasswordInput
            id="password"
            name="password"
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
