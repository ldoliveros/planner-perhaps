import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { UpdateBannerController } from "@/components/shared/update-banner-controller";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { AdminAccountProvider, AdminHeaderActions } from "@/components/admin/admin-account";
import type { AdminSpace } from "@/components/admin/admin-spaces-nav";
import { createClient } from "@/lib/supabase/server";
import { getCurrentReleaseForRole } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";

/**
 * Shell de la administración (sidebar, barra mobile, campanita + avatar, banner de novedades) con su control de
 * acceso. Lo usan el layout de /admin y (v1.6) Novedades (/changelog) para el staff, sin duplicar sidebar,
 * encabezado ni autenticación.
 */
export async function AdminAppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, avatar_url, last_seen_version")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "super_admin" && profile?.role !== "account_manager") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Tu cuenta ({user.email}) no tiene permisos de administrador todavía.
        </p>
        <SignOutButton variant="button" redirectTo="/login">
          Cerrar sesión
        </SignOutButton>
      </div>
    );
  }

  // Espacios del sidebar (v1.6): clientes activos visibles para el usuario. La misma RLS de `clients` que usa
  // Publicaciones decide cuáles son (Super Admin: todos; Account Manager: solo los asignados).
  const { data: spaceRows } = await supabase
    .from("clients")
    .select("id, name, color, active")
    .eq("active", true)
    .order("name");
  const spaces: AdminSpace[] = (spaceRows ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color }));

  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "1";

  const lastSeenVersion = profile.last_seen_version;
  const currentRelease = getCurrentReleaseForRole(profile.role);
  const showUpdateBanner = currentRelease !== null && lastSeenVersion !== APP_VERSION;

  // Un único NotificationsProvider por layout: una sola suscripción Realtime compartida por la campanita de
  // desktop (extremo superior derecho del contenido) y la de la barra mobile.
  const account = {
    role: profile.role,
    email: user.email ?? null,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
  };

  return (
    <NotificationsProvider userId={user.id}>
    <AdminAccountProvider account={account}>
    <div data-admin-shell className="flex h-dvh overflow-hidden bg-background">
      <AdminSidebar
        role={profile.role}
        defaultCollapsed={defaultCollapsed}
        spaces={spaces}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AdminMobileNav
          role={profile.role}
          spaces={spaces}
        />
        <main className="relative min-w-0 flex-1 overflow-y-auto bg-white">
          {/* Desktop: campanita + avatar en el extremo superior derecho de TODAS las pantallas de /admin, alineados
              con la fila de título y scrolleando con ella (ver lib/admin-shell.ts). En mobile van en la barra
              superior (AdminMobileNav). */}
          <AdminHeaderActions floating className="absolute top-[22px] right-6 z-30 hidden md:flex" />
          {children}
        </main>
      </div>
      {showUpdateBanner && <UpdateBannerController version={APP_VERSION} />}
    </div>
    </AdminAccountProvider>
    </NotificationsProvider>
  );
}
