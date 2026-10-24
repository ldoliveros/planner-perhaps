"use client";

import { createContext, useContext } from "react";
import type { Publication } from "@/types";

/** Archiva una publicación (v1.6): server action + lista local + toast "Deshacer". Devuelve si se archivó. */
type ArchivePublication = (publication: Publication) => Promise<boolean>;

/**
 * CalendarScreen provee la acción de archivar (misma lógica para el menú de las tarjetas y el editor). null cuando no
 * corresponde ofrecerla: Client User (solo lectura) o archivado todavía no disponible en la base.
 */
const PublicationArchiveContext = createContext<ArchivePublication | null>(null);

export const PublicationArchiveProvider = PublicationArchiveContext.Provider;

export function usePublicationArchive(): ArchivePublication | null {
  return useContext(PublicationArchiveContext);
}
