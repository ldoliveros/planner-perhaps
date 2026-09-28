"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useImageAspectRatio } from "./use-image-aspect-ratio";
import { cn } from "cn";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Facebook Carrusel. Misma estructura de navegación que el Carrusel de Instagram
 * (mismo hook de aspect-ratio, navegación local que no toca dirty state), con los mismos patrones
 * reconocibles de Facebook Post: nombre sin "@", copy arriba de la imagen, acciones con ícono + etiqueta
 * fija. El acceso a Drive vive fuera del preview (PublicationView, debajo).
 */
export function FacebookCarouselPreview({ coverUrl, images, handle, accountName, copy, avatarUrl }: PublicationPreviewProps) {
  const slides = images && images.length > 0 ? images : coverUrl ? [coverUrl] : [];
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(slides.length - 1, 0));
  const displayName = accountName ?? handle ?? "Sin cuenta";

  // El formato lo define SOLO la primera placa — mismo hook y misma regla que Instagram Carrusel.
  const frameRatio = useImageAspectRatio(slides[0]);

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(slides.length - 1, next)));
  }

  return (
    <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
      <div className="flex items-center gap-2 p-2.5">
        {avatarUrl ? (
          <span className="relative size-8 shrink-0 overflow-hidden rounded-full bg-white">
            <Image src={avatarUrl} alt="" fill sizes="32px" className="object-cover" />
          </span>
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
        <PlatformIcon platformKey="facebook" className="ml-auto size-4" style={{ color: "#1877F2" }} />
      </div>

      {copy && (
        <div className="px-2.5 pb-2">
          <p className="line-clamp-3 text-sm text-foreground">{copy}</p>
        </div>
      )}

      <div className="relative w-full bg-black" style={{ aspectRatio: frameRatio }}>
        {slides.length > 0 ? (
          <Image src={slides[current]} alt="" fill sizes="320px" className="object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted">
            <ImageIcon className="size-10 text-muted-foreground/40" />
          </div>
        )}

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              aria-label="Imagen anterior"
              className="absolute top-1/2 left-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow transition-opacity disabled:opacity-0"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              disabled={current === slides.length - 1}
              aria-label="Imagen siguiente"
              className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow transition-opacity disabled:opacity-0"
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
              {current + 1} / {slides.length}
            </span>
          </>
        )}

        {slides.length > 1 && (
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1">
            {slides.map((_, i) => (
              <span key={i} className={cn("size-1.5 rounded-full", i === current ? "bg-white" : "bg-white/40")} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ThumbsUp className="size-4" />
          Me gusta
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageCircle className="size-4" />
          Comentar
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Share2 className="size-4" />
          Compartir
        </span>
      </div>
    </div>
  );
}
