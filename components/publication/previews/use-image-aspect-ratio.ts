"use client";

import { useEffect, useState } from "react";

/** Los 3 ratios que Instagram soporta realmente para feed/post/carrusel — se clasifica al más cercano,
 * no se usa el ratio exacto de la imagen (evita proporciones raras si alguien sube algo atípico). */
const SUPPORTED_RATIOS = [4 / 5, 1, 1.91] as const;

function closestSupportedRatio(width: number, height: number): number {
  if (!width || !height) return 1;
  const actual = width / height;
  return SUPPORTED_RATIOS.reduce((closest, candidate) =>
    Math.abs(actual - candidate) < Math.abs(actual - closest) ? candidate : closest
  );
}

/**
 * Detecta el aspect-ratio real de una imagen (vía naturalWidth/naturalHeight, funciona igual con una URL
 * firmada ya guardada que con un blob: de un archivo recién elegido) y lo clasifica al ratio soportado
 * más cercano (4:5, 1:1, 1.91:1). Usado por los previews de Carousel y Post para que ambos midan igual
 * en vez de reimplementar la misma lógica de sondeo + clasificación cada uno por su lado.
 */
export function useImageAspectRatio(url: string | null | undefined): number {
  const [ratio, setRatio] = useState(1);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (!cancelled) setRatio(closestSupportedRatio(probe.naturalWidth, probe.naturalHeight));
    };
    probe.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return ratio;
}
