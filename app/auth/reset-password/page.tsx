"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { AuthBrandHeader } from "@/components/auth/auth-brand-header";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type UpdatePasswordState } from "@/lib/actions/auth";

const initialState: UpdatePasswordState = { error: null, savedAt: null };

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(updatePassword, initialState);
  const router = useRouter();
  const lastSavedAt = useRef<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      setDone(true);
      const timeout = setTimeout(() => router.push("/login"), 1500);
      return () => clearTimeout(timeout);
    }
  }, [state.savedAt, router]);

  return (
    <AuthSplitLayout>
      <AuthBrandHeader />

      {done ? (
        <div className="flex flex-col items-start gap-2 py-2">
          <CheckCircle2 className="size-8 text-[#26a9e0]" />
          <p className="text-lg font-semibold text-foreground">Contraseña actualizada</p>
          <p className="text-sm text-muted-foreground">Te llevamos al ingreso en un momento...</p>
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-foreground">Nueva contraseña</h1>
          <p className="mt-3 text-sm text-muted-foreground">Elegí una contraseña de al menos 10 caracteres.</p>

          <form action={formAction} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                autoFocus
                className="h-11 rounded-xl px-3.5"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
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
              {isPending ? "Guardando..." : "Guardar contraseña"}
            </Button>

            <Link
              href="/login"
              className="text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Volver a iniciar sesión
            </Link>
          </form>
        </>
      )}
    </AuthSplitLayout>
  );
}
