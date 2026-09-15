import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PerhapsLogo } from "@/components/branding/perhaps-logo";
import { AdminNav } from "@/components/admin/admin-nav";
import { UserMenu } from "@/components/shared/user-menu";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "super_admin" && profile?.role !== "account_manager") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Tu cuenta ({user.email}) no tiene permisos de administrador todavía.
        </p>
        <form action={signOut.bind(null, "/login")}>
          <Button variant="outline" size="sm" type="submit">
            Cerrar sesión
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto sm:gap-4">
          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <PerhapsLogo height={16} />
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Planificador Editorial</span>
          </Link>
          <AdminNav role={profile.role} />
        </div>
        <UserMenu
          email={user.email ?? null}
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
          profileHref="/admin/profile"
          signOutRedirectTo="/login"
        />
      </div>
      {children}
    </div>
  );
}
