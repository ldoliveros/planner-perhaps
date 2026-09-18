import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/queries";
import { getChangelogForRole } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";

function formatReleaseDate(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function ChangelogPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const releases = getChangelogForRole(profile.role);
  const backHref = profile.role === "client" ? "/client" : "/admin";

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Volver
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Novedades</h1>
        <p className="text-sm text-muted-foreground">Perhaps Planner · versión actual v{APP_VERSION}</p>
      </div>

      <div className="flex flex-col gap-8">
        {releases.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay novedades para mostrar.</p>
        )}
        {releases.map((release) => (
          <div key={release.version} className="flex flex-col gap-3 border-b border-border pb-8 last:border-0 last:pb-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold text-foreground">v{release.version}</h2>
              <span className="text-xs text-muted-foreground">{formatReleaseDate(release.date)}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {release.entries.map((entry, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground">
                  <span className="text-muted-foreground">–</span>
                  {entry.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
