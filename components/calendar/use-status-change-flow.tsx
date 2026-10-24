"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLookups } from "@/components/providers/lookups-provider";
import { usePublicationPatch } from "@/components/calendar/publication-patch-context";
import { ReviewRequestDialog } from "@/components/publication/review-request-dialog";
import { setPublicationStatus } from "@/lib/actions/publications";
import { requiresReviewConfirmation } from "@/lib/editorial-transitions";
import { toast } from "@/lib/toast";
import type { Publication } from "@/types";

/**
 * Flujo de cambio de estado de una publicación (v1.6), compartido por el menú `•••` de las tarjetas y el Tablero:
 *   * Pasar a "En revisión" desde otro estado → diálogo "Enviar a revisión".
 *   * Cualquier otro cambio (incluido Aprobado) se guarda directo. Los avisos por email de v1.6 ("Enviar a revisión" y
 *     "¡Lista para publicar!") quedaron postergados para F5: este flujo no envía ni encola emails.
 *   * El cambio se guarda con `setPublicationStatus(id, nuevo, estadoQueVeíaElUsuario)`: UPDATE condicional (si otro lo
 *     cambió mientras tanto, no se pisa y se informa) bajo la RLS de siempre (solo staff con acceso al cliente).
 * `request` devuelve si el cambio quedó guardado (false si falló o si el usuario canceló el diálogo), así el Tablero
 * puede devolver la tarjeta a su columna. Un pedido a la vez: mientras hay uno en curso, otro se rechaza.
 */
export function useStatusChangeFlow() {
  const { statuses } = useLookups();
  const router = useRouter();
  const patchPublication = usePublicationPatch();
  const [pending, setPending] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  // Pedido en curso que espera la confirmación de "Enviar a revisión".
  const [reviewTarget, setReviewTarget] = useState<{ publication: Publication; statusId: string } | null>(null);
  const resolverRef = useRef<((saved: boolean) => void) | null>(null);
  const inFlightRef = useRef(false);
  // "Enviar a revisión" ya se confirmó: el cierre que dispara el propio diálogo no es una cancelación.
  const reviewDecidedRef = useRef(false);

  function settle(saved: boolean) {
    inFlightRef.current = false;
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(saved);
  }

  /** Guarda el cambio de estado. */
  async function apply(publication: Publication, statusId: string): Promise<boolean> {
    setPending(true);
    let result: { error: string | null };
    try {
      result = await setPublicationStatus(publication.id, statusId, publication.statusId);
    } catch {
      result = { error: "No se pudo conectar con el servidor. Probá de nuevo." };
    }
    setPending(false);
    if (result.error) {
      toast.error("No se pudo actualizar el estado", result.error);
      return false;
    }
    // Publicaciones (global): la lista local no se resincroniza con router.refresh() — se parchea acá.
    patchPublication?.(publication.id, { statusId });
    startRefresh(() => router.refresh());
    const label = statuses.find((s) => s.id === statusId)?.label ?? "";
    toast.success(`Estado actualizado a ${label}`);
    return true;
  }

  /** Pide el cambio de estado con los mismos pasos que el menú `•••`. */
  async function request(publication: Publication, statusId: string): Promise<boolean> {
    if (statusId === publication.statusId) return false;
    if (inFlightRef.current) {
      toast.info("Esperá a que termine el cambio anterior");
      return false;
    }
    inFlightRef.current = true;
    reviewDecidedRef.current = false;
    const done = new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
    const inReviewStatusId = statuses.find((s) => s.key === "in_review")?.id;
    if (requiresReviewConfirmation({ targetStatusId: statusId, savedStatusId: publication.statusId, inReviewStatusId })) {
      setReviewTarget({ publication, statusId });
      return done;
    }
    settle(await apply(publication, statusId));
    return done;
  }

  const dialogs: ReactNode = reviewTarget && (
    <ReviewRequestDialog
      open
      onCancel={() => {
        if (reviewDecidedRef.current) {
          reviewDecidedRef.current = false;
          return;
        }
        setReviewTarget(null);
        settle(false);
      }}
      onConfirm={() => {
        const target = reviewTarget;
        reviewDecidedRef.current = true;
        setReviewTarget(null);
        void apply(target.publication, target.statusId).then(settle);
      }}
    />
  );

  return { request, pending: pending || isRefreshing, dialogs };
}
