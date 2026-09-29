"use client";

import { createContext, useContext } from "react";
import type { Publication } from "@/types";

type PatchPublication = (publicationId: string, patch: Partial<Publication>) => void;

/**
 * Publicaciones (global): CalendarScreen mantiene su propia lista local (globalPublications), que
 * router.refresh() no resincroniza. Las acciones que mutan una publicación fuera de PublicationView (Cambiar
 * estado, Cambiar fecha y el drag & drop entre días) la parchean por acá para que la UI refleje el cambio al instante. En el Planner de un cliente no hay
 * provider (null) y todo sigue dependiendo de router.refresh(), sin cambios.
 */
const PublicationPatchContext = createContext<PatchPublication | null>(null);

export const PublicationPatchProvider = PublicationPatchContext.Provider;

export function usePublicationPatch(): PatchPublication | null {
  return useContext(PublicationPatchContext);
}
