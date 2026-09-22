import { LoginScreen } from "@/components/auth/login-screen";
import { sanitizeNext } from "@/lib/safe-next";

/**
 * Acceso único para Super Admin, Account Manager y Client. `?error=1` lo agrega /auth/callback si el enlace falló.
 * `?next=` (lo agrega el proxy al pedir una ruta protegida sin sesión) es a dónde continuar después de ingresar.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return <LoginScreen linkError={error === "1"} next={sanitizeNext(next) ?? undefined} />;
}
