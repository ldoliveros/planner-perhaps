"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { AuthBrandHeader } from "@/components/auth/auth-brand-header";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SetPasswordForm } from "@/components/auth/set-password-form";

/** Recuperación de contraseña (usuarios existentes): llegan acá desde el mail de "¿Olvidaste tu contraseña?". */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const handleSaved = useCallback(() => setDone(true), []);

  useEffect(() => {
    if (!done) return;
    const timeout = setTimeout(() => router.push("/login"), 1500);
    return () => clearTimeout(timeout);
  }, [done, router]);

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
        <SetPasswordForm
          heading="Nueva contraseña"
          description="Elegí una contraseña de al menos 10 caracteres."
          submitLabel="Guardar contraseña"
          pendingLabel="Guardando..."
          onSaved={handleSaved}
          footer={
            <Link
              href="/login"
              className="text-center text-xs text-muted-foreground hover:text-foreground hover:underline pointer-coarse:min-h-11"
            >
              Volver a iniciar sesión
            </Link>
          }
        />
      )}
    </AuthSplitLayout>
  );
}
