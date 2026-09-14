import { redirect } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PerhapsLogo } from "@/components/branding/perhaps-logo";
import { getClientById, getCurrentProfile } from "@/lib/supabase/queries";
import { getContrastTextColor } from "@/lib/color-contrast";
import { signOut } from "@/lib/actions/auth";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/client/login");
  }

  if (profile.role !== "client" || !profile.clientId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Tu cuenta ({profile.email}) todavía no está asociada a un cliente. Contactá a tu equipo de gestión.
        </p>
        <form action={signOut.bind(null, "/client/login")}>
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
        <form action={signOut.bind(null, "/client/login")}>
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
        <form action={signOut.bind(null, "/client/login")} className="shrink-0">
          <Button variant="ghost" size="sm" type="submit" className="gap-1.5 text-xs text-muted-foreground">
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">{profile.email}</span>
          </Button>
        </form>
      </div>
      {children}
    </div>
  );
}
