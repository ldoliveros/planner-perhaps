import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { UpdateBannerController } from "@/components/shared/update-banner-controller";
import { createClient } from "@/lib/supabase/server";
import { getLastSeenVersion } from "@/lib/supabase/queries";
import { signOut } from "@/lib/actions/auth";
import { getCurrentReleaseForRole } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";

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

  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "1";

  const lastSeenVersion = await getLastSeenVersion(user.id);
  const currentRelease = getCurrentReleaseForRole(profile.role);
  const showUpdateBanner = currentRelease !== null && lastSeenVersion !== APP_VERSION;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AdminSidebar
        role={profile.role}
        email={user.email ?? null}
        fullName={profile.full_name}
        avatarUrl={profile.avatar_url}
        defaultCollapsed={defaultCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AdminMobileNav
          role={profile.role}
          email={user.email ?? null}
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      {showUpdateBanner && currentRelease && (
        <UpdateBannerController version={APP_VERSION} entries={currentRelease.entries} />
      )}
    </div>
  );
}
