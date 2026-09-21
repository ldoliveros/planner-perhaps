"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { updatePassword, type UpdatePasswordState } from "@/lib/actions/auth";

const initialState: UpdatePasswordState = { error: null, savedAt: null };

interface SetPasswordFormProps {
  heading: string;
  description: string;
  submitLabel: string;
  pendingLabel: string;
  /** Se llama una vez cuando la contraseña quedó guardada (la sesión ya estaba abierta). */
  onSaved: () => void;
  /** Contenido debajo del botón (p. ej. link de vuelta al login). */
  footer?: ReactNode;
}

/**
 * Formulario "elegir contraseña" con la sesión ya abierta: recuperación de contraseña (/auth/reset-password)
 * e invitación inicial (/auth/confirm). Ambos usan `updatePassword` (mínimo 10 caracteres + confirmación).
 */
export function SetPasswordForm({ heading, description, submitLabel, pendingLabel, onSaved, footer }: SetPasswordFormProps) {
  const [state, formAction, isPending] = useActionState(updatePassword, initialState);
  const lastSavedAt = useRef<number | null>(null);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      onSaved();
    }
  }, [state.savedAt, onSaved]);

  return (
    <>
      <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-foreground">{heading}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Nueva contraseña</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={10}
            required
            autoFocus
            className="h-11 rounded-xl px-3.5"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={10}
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
          {isPending ? pendingLabel : submitLabel}
        </Button>

        {footer}
      </form>
    </>
  );
}
