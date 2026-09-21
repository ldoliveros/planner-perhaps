"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { AuthBrandHeader } from "@/components/auth/auth-brand-header";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { requestMagicLink, signIn, type AuthActionState, type MagicLinkState } from "@/lib/actions/auth";

const EMAIL_PLACEHOLDER = "nombre@empresa.com";
const initialSignInState: AuthActionState = { error: null };
const initialMagicState: MagicLinkState = { error: null, sentAt: null };

type Mode = "password" | "magic" | "forgot";

const LINK_BUTTON_CLASS =
  "text-center text-xs text-muted-foreground hover:text-foreground hover:underline pointer-coarse:min-h-11";

/**
 * Acceso único de Perhaps Planner (Super Admin, Account Manager y Client). Contraseña como acceso
 * principal, enlace por email como alternativa y recuperación de contraseña. Es el mismo usuario de
 * Auth en los tres casos; el destino lo decide el rol (`signIn` y `/auth/callback` → `/`).
 */
export function LoginScreen({ linkError }: { linkError: boolean }) {
  const [mode, setMode] = useState<Mode>("password");

  return (
    <AuthSplitLayout>
      <AuthBrandHeader />

      {mode === "password" && (
        <PasswordForm linkError={linkError} onMagicLink={() => setMode("magic")} onForgot={() => setMode("forgot")} />
      )}
      {mode === "magic" && <MagicLinkForm onBack={() => setMode("password")} />}
      {mode === "forgot" && <ForgotPasswordForm onBack={() => setMode("password")} placeholder={EMAIL_PLACEHOLDER} />}
    </AuthSplitLayout>
  );
}

/** Acceso principal: email + contraseña. */
function PasswordForm({
  linkError,
  onMagicLink,
  onForgot,
}: {
  linkError: boolean;
  onMagicLink: () => void;
  onForgot: () => void;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(signIn, initialSignInState);
  // Estado que había al enviar: mientras no cambie, la respuesta del servidor todavía no llegó. Da feedback inmediato
  // en el submit (isPending tarda en reflejarse) y bloquea un segundo envío.
  const [submittedFrom, setSubmittedFrom] = useState<AuthActionState | null>(null);
  // Con login correcto el servidor devuelve el destino: se queda "Ingresando…" hasta que la navegación termine.
  const busy = isPending || submittedFrom === state || Boolean(state.redirectTo);
  const error = state.error ?? (linkError ? "El enlace no es válido o ya venció. Pedí uno nuevo." : null);

  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state.redirectTo, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (busy) {
      event.preventDefault();
      return;
    }
    setSubmittedFrom(state);
  }

  return (
    <>
      <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-foreground">Ingresá a tu cuenta</h1>
      <p className="mt-3 text-sm text-muted-foreground">Usá tu email y contraseña para entrar a Planner by Perhaps.</p>

      <form action={formAction} onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={EMAIL_PLACEHOLDER}
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={busy}
          className="h-11 rounded-xl bg-[#26a9e0] text-white hover:bg-[#1c8fc0] disabled:opacity-60"
        >
          {busy ? "Ingresando…" : "Ingresar"}
        </Button>

        <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={busy} onClick={onMagicLink}>
          Ingresar con un enlace por email
        </Button>

        <button type="button" onClick={onForgot} disabled={busy} className={LINK_BUTTON_CLASS}>
          ¿Olvidaste tu contraseña?
        </button>
      </form>
    </>
  );
}

/** Alternativa: link de acceso por email (mismo usuario; no crea cuentas nuevas ni revela si el email existe). */
function MagicLinkForm({ onBack }: { onBack: () => void }) {
  const [state, formAction, isPending] = useActionState(requestMagicLink, initialMagicState);
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
          Si tu email está registrado, te enviamos un link para ingresar. Puede tardar unos minutos.
        </p>
        <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={onBack}>
          Volver a ingresar
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-foreground">
        Ingresar con
        <br />
        un enlace por email
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">Te enviaremos un enlace seguro a tu email para ingresar.</p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="magic-email">Email</Label>
          <Input
            id="magic-email"
            name="email"
            type="email"
            placeholder={EMAIL_PLACEHOLDER}
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

        <button type="button" onClick={onBack} className={LINK_BUTTON_CLASS}>
          Volver a ingresar con contraseña
        </button>
      </form>
    </>
  );
}
