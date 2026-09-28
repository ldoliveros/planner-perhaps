import type { ReactNode } from "react";
import { InstagramReelPreview } from "./instagram-reel-preview";
import { InstagramCarouselPreview } from "./instagram-carousel-preview";
import { InstagramPostPreview } from "./instagram-post-preview";
import { InstagramStoryPreview } from "./instagram-story-preview";
import type { PublicationPreviewProps } from "./types";

/**
 * Un adaptador por combinación plataforma+tipo. Agregar uno nuevo = un componente nuevo + una entrada
 * acá, sin tocar el resto (PublicationView solo pide el nodo renderizado por key, nunca conoce el
 * detalle visual de cada red). Deliberadamente un mapa plano, no una jerarquía de clases — no hace
 * falta más hasta que haya un segundo/tercer adaptador real.
 *
 * Devuelve el ReactNode ya renderizado (no el componente en sí) para que el caller nunca asigne un
 * componente a una variable con mayúscula inicial y lo use como <PreviewComponent/> — ese patrón,
 * aunque acá el componente es siempre la misma referencia estable, dispara el lint de "no crear
 * componentes durante el render" (no puede probar que no es una fábrica nueva cada vez).
 */
export function renderPublicationPreview(
  platformKey: string | undefined,
  contentTypeKey: string | undefined,
  props: PublicationPreviewProps
): ReactNode | null {
  if (platformKey === "instagram" && contentTypeKey === "reel") {
    return <InstagramReelPreview {...props} />;
  }
  if (platformKey === "instagram" && contentTypeKey === "carousel") {
    return <InstagramCarouselPreview {...props} />;
  }
  if (platformKey === "instagram" && contentTypeKey === "post") {
    return <InstagramPostPreview {...props} />;
  }
  if (platformKey === "instagram" && contentTypeKey === "story") {
    return <InstagramStoryPreview {...props} />;
  }
  return null;
}
