import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/queries";
import { getChangelogForRole } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { GLOBAL_CALENDAR_THEME } from "@/lib/calendar-surface";
import { cn } from "cn";

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

  return (
    // v1.6: dentro del shell (ver layout.tsx), con el scroll normal del área de contenido; columna de lectura centrada.
    <div className={cn("flex flex-1 flex-col", ADMIN_SURFACE)}>
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-12 px-4 py-6 sm:px-6 md:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Novedades</h1>
        <p className="text-sm text-muted-foreground">Planner by Perhaps · versión actual v{APP_VERSION}</p>
      </div>

      <div className="flex flex-col gap-10">
        {releases.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay novedades para mostrar.</p>
        )}
        {releases.map((release) => (
          <div
            key={release.version}
            id={`v${release.version}`}
            className="flex scroll-mt-6 flex-col gap-4 border-b border-border pb-10 last:border-0 last:pb-0"
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">v{release.version}</h2>
                {/* Versión actual: la que coincide con APP_VERSION (lib/version.ts), la misma fuente que el subtítulo. */}
                {release.version === APP_VERSION && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium"
                    style={{ backgroundColor: GLOBAL_CALENDAR_THEME.accentSoft, color: GLOBAL_CALENDAR_THEME.accentInk }}
                  >
                    Actual
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{formatReleaseDate(release.date)}</span>
            </div>
            <ul className="flex flex-col gap-3">
              {release.entries.map((entry, i) => (
                <li key={i} className="flex gap-2 text-sm leading-7 text-foreground">
                  <span className="text-muted-foreground">–</span>
                  {entry.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
