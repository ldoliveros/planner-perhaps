"use client";

import { useState } from "react";
import { UpdateBanner } from "@/components/shared/update-banner";
import { markVersionSeen } from "@/lib/actions/app-meta";

interface UpdateBannerControllerProps {
  version: string;
}

/**
 * Orquesta el banner "Nuevas actualizaciones" del lado del cliente. Se monta
 * únicamente cuando el server ya determinó que corresponde mostrarlo
 * (last_seen_version !== version) — acá solo se maneja el ciclo de
 * "Entendido": persistir -> esperar confirmación -> recién ahí cerrar.
 * Si falla, el banner queda abierto con el error visible y el mismo botón
 * sirve para reintentar. Un guard por isSaving evita doble click/doble submit.
 */
export function UpdateBannerController({ version }: UpdateBannerControllerProps) {
  const [shown, setShown] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDismiss() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    const result = await markVersionSeen(version);
    setIsSaving(false);
    if (result.error) {
      setError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setShown(false);
  }

  if (!shown) return null;
  return (
    <UpdateBanner version={version} isSaving={isSaving} error={error} onDismiss={handleDismiss} />
  );
}
