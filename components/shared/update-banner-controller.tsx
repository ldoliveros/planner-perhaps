"use client";

import { useState } from "react";
import { UpdateBanner } from "@/components/shared/update-banner";
import { markVersionSeen } from "@/lib/actions/app-meta";
import type { ChangelogEntry } from "@/lib/changelog";

interface UpdateBannerControllerProps {
  version: string;
  entries: ChangelogEntry[];
  initiallyShown: boolean;
}

/**
 * v1.2 Bloque A — decide en el cliente si el banner sigue visible, y
 * persiste last_seen_version al descartarlo (no bloqueante: si la escritura
 * falla, el banner igual se cierra — el peor caso es volver a verlo en la
 * próxima carga, nunca quedar trabado en pantalla).
 *
 * TODO (recordatorio, no wiring aún): montar esto en app/admin/layout.tsx y
 * app/client/(protected)/layout.tsx recién después de aplicar la migration
 * 20260917000001_last_seen_version.sql — antes de eso, getLastSeenVersion()
 * fallaría en cada carga de página.
 */
export function UpdateBannerController({ version, entries, initiallyShown }: UpdateBannerControllerProps) {
  const [shown, setShown] = useState(initiallyShown);

  function handleDismiss() {
    setShown(false);
    void markVersionSeen(version);
  }

  if (!shown) return null;
  return <UpdateBanner version={version} entries={entries} onDismiss={handleDismiss} />;
}
