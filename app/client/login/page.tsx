import { redirect } from "next/navigation";

/** Compatibilidad con links y favoritos anteriores: el acceso oficial es /login para todos los roles. */
export default async function ClientLoginRedirect({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  redirect(error === "1" ? "/login?error=1" : "/login");
}
