"use client";

import { useEffect } from "react";

/**
 * Red de seguridad: si Supabase no acepta el `redirectTo` de un enlace de invitación (lista de Redirect URLs),
 * cae en la Site URL y la sesión llega en el fragmento de cualquier página. Se reenvía a /auth/confirm, que
 * sabe procesarla o mostrar el error de "enlace vencido".
 */
export function AuthHashRedirect() {
  useEffect(() => {
    const { pathname, hash } = window.location;
    if (pathname === "/auth/confirm") return;
    if (/[#&](access_token|error_code)=/.test(hash)) {
      window.location.replace(`/auth/confirm${hash}`);
    }
  }, []);

  return null;
}
