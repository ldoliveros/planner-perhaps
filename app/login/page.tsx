import { LoginScreen } from "@/components/auth/login-screen";

/** Acceso único para Super Admin, Account Manager y Client. `?error=1` lo agrega /auth/callback si el enlace falló. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginScreen linkError={error === "1"} />;
}
