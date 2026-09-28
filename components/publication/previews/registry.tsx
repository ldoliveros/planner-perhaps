import type { ReactNode } from "react";
import { InstagramReelPreview } from "./instagram-reel-preview";
import { InstagramCarouselPreview } from "./instagram-carousel-preview";
import { InstagramPostPreview } from "./instagram-post-preview";
import { InstagramStoryPreview } from "./instagram-story-preview";
import { FacebookPostPreview } from "./facebook-post-preview";
import { FacebookCarouselPreview } from "./facebook-carousel-preview";
import { FacebookReelPreview } from "./facebook-reel-preview";
import { FacebookStoryPreview } from "./facebook-story-preview";
import type { PublicationPreviewProps } from "./types";

/** Misma matriz de combinaciones soportadas que abajo, en forma de datos (sin JSX) — la usa
 * PublicationView para saber qué plataformas ofrecer como tab/pill para el tipo de contenido actual,
 * sin tener que renderizar nada solo para averiguarlo. */
const SUPPORTED_COMBOS: Record<string, string[]> = {
  instagram: ["reel", "carousel", "post", "story"],
  facebook: ["post", "carousel", "reel", "story"],
};

export function isPreviewSupported(platformKey: string, contentTypeKey: string | undefined): boolean {
  return Boolean(contentTypeKey && SUPPORTED_COMBOS[platformKey]?.includes(contentTypeKey));
}

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
  if (platformKey === "facebook" && contentTypeKey === "post") {
    return <FacebookPostPreview {...props} />;
  }
  if (platformKey === "facebook" && contentTypeKey === "carousel") {
    return <FacebookCarouselPreview {...props} />;
  }
  if (platformKey === "facebook" && contentTypeKey === "reel") {
    return <FacebookReelPreview {...props} />;
  }
  if (platformKey === "facebook" && contentTypeKey === "story") {
    return <FacebookStoryPreview {...props} />;
  }
  return null;
}
