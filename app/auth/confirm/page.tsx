"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthBrandHeader } from "@/components/auth/auth-brand-header";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "create-password";

interface HashSession {
  accessToken: string;
  refreshToken: string;
  type: string | null;
}

/** Lee la sesión del fragmento de la URL; `null` si no hay tokens o si Supabase informó un error (enlace vencido/usado). */
function readHashSession(): HashSession | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (params.get("error") || params.get("error_code") || !accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, type: params.get("type") };
}

/**
 * Destino del enlace de INVITACIÓN (y de cualquier enlace de Supabase que llegue por "implicit flow").
 * Las invitaciones se generan con la Admin API (sin PKCE), así que Supabase devuelve la sesión en el
 * fragmento de la URL (`#access_token=...&type=invite`), que el servidor nunca ve: por eso /auth/callback
 * (que espera `?code=`) no las podía procesar. Acá se lee el fragmento en el navegador, se abre la sesión
 * y, si es una invitación, el usuario crea su contraseña. No es un registro público: el enlace solo existe
 * si un Super Admin invitó ese email, y Magic Link sigue usando `shouldCreateUser: false`.
 */
export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  // Se lee una sola vez (antes de limpiar la URL) para que el doble efecto de StrictMode en dev no pierda los tokens.
  const [session] = useState(readHashSession);

  useEffect(() => {
    // No dejar los tokens en la barra de direcciones ni en el historial.
    window.history.replaceState(null, "", window.location.pathname);

    if (!session) {
      router.replace("/login?error=1");
      return;
    }

    let cancelled = false;
    createClient()
      .auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken })
      .then(({ error }) => {
        if (cancelled) return;
        if (error) {
          router.replace("/login?error=1");
        } else if (session.type === "invite") {
          setStatus("create-password");
        } else if (session.type === "recovery") {
          router.replace("/auth/reset-password");
        } else {
          router.replace("/");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, session]);

  return (
    <AuthSplitLayout>
      <AuthBrandHeader />

      {status === "checking" ? (
        <p className="text-sm text-muted-foreground">Validando tu enlace...</p>
      ) : (
        <SetPasswordForm
          heading="Crear tu contraseña"
          description="Elegí una contraseña de al menos 10 caracteres para entrar a Perhaps Planner."
          submitLabel="Crear contraseña"
          pendingLabel="Creando..."
          // Navegación completa: la sesión ya está abierta y "/" te lleva a tu pantalla según el rol.
          onSaved={() => window.location.replace("/")}
        />
      )}
    </AuthSplitLayout>
  );
}
