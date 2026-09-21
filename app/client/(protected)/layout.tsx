import { redirect } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { PerhapsLogo } from "@/components/branding/perhaps-logo";
import { UserMenu } from "@/components/shared/user-menu";
import { UpdateBannerController } from "@/components/shared/update-banner-controller";
import { getClientById, getCurrentProfile, getLastSeenVersion } from "@/lib/supabase/queries";
import { getContrastTextColor } from "@/lib/color-contrast";
import { signOut } from "@/lib/actions/auth";
import { getCurrentReleaseForRole } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "client" || !profile.clientId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Tu cuenta ({profile.email}) todavía no está asociada a un cliente. Contactá a tu equipo de gestión.
        </p>
        <form action={signOut.bind(null, "/login")}>
          <Button variant="outline" size="sm" type="submit">
            Cerrar sesión
          </Button>
        </form>
      </div>
    );
  }

  const client = await getClientById(profile.clientId);
  if (!client) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">No pudimos cargar tu cuenta. Contactá a tu equipo de gestión.</p>
        <form action={signOut.bind(null, "/login")}>
          <Button variant="outline" size="sm" type="submit">
            Cerrar sesión
          </Button>
        </form>
      </div>
    );
  }

  const lastSeenVersion = await getLastSeenVersion(profile.userId);
  const currentRelease = getCurrentReleaseForRole(profile.role);
  const showUpdateBanner = currentRelease !== null && lastSeenVersion !== APP_VERSION;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <PerhapsLogo height={16} className="shrink-0" />
          <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />
          <div className="flex min-w-0 items-center gap-1.5">
            <div
              className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold"
              style={
                client.logoUrl ? undefined : { backgroundColor: client.color, color: getContrastTextColor(client.color) }
              }
            >
              {client.logoUrl ? (
                <Image src={client.logoUrl} alt={client.name} fill sizes="20px" className="object-cover" />
              ) : (
                client.name.charAt(0)
              )}
            </div>
            <span className="truncate text-xs font-medium text-foreground">{client.name}</span>
          </div>
        </div>
        <UserMenu
          email={profile.email}
          fullName={profile.fullName}
          avatarUrl={profile.avatarUrl}
          profileHref="/client/profile"
          signOutRedirectTo="/login"
        />
      </div>
      {children}
      {showUpdateBanner && <UpdateBannerController version={APP_VERSION} />}
    </div>
  );
}
