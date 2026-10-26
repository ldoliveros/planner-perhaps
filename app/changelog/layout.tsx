import { redirect } from "next/navigation";
import { AdminAppShell } from "@/components/admin/admin-app-shell";
import { ClientAppShell } from "@/components/client/client-app-shell";
import { getCurrentProfile } from "@/lib/supabase/queries";

/**
 * v1.6 — Novedades dentro del shell habitual de quien la abre (sidebar de la administración para el staff, barra
 * del portal para el Client User), reutilizando los mismos shells — y su control de acceso — que /admin y /client.
 * La ruta sigue siendo /changelog y sigue requiriendo sesión.
 */
export default async function ChangelogLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile.role === "client" ? <ClientAppShell>{children}</ClientAppShell> : <AdminAppShell>{children}</AdminAppShell>;
}
