"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Heart, ImageIcon, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { cn } from "cn";
import { useImageAspectRatio } from "./use-image-aspect-ratio";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Instagram Carrusel. Formato feed (no 9:16, a diferencia del Reel). La navegación
 * anterior/siguiente es puramente local a este componente (useState propio): nunca toca datos de la
 * publicación ni el dirty state de PublicationView. Mismo lenguaje visual aprobado del Reel: sin
 * conteos inventados. El acceso a Drive vive fuera del preview (PublicationView, debajo) — esto es solo
 * la simulación visual.
 */
export function InstagramCarouselPreview({ coverUrl, images, handle, accountName, copy, avatarUrl }: PublicationPreviewProps) {
  const slides = images && images.length > 0 ? images : coverUrl ? [coverUrl] : [];
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(slides.length - 1, 0));

  // El formato del carrusel lo define SOLO la primera placa (funciona igual con una URL firmada ya
  // guardada o con un blob: de una imagen recién elegida, todavía sin guardar). Placas siguientes con
  // otra proporción no se recortan: se usa object-contain más abajo, así se ven completas igual.
  const frameRatio = useImageAspectRatio(slides[0]);

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(slides.length - 1, next)));
  }

  return (
    <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
      <div className="flex items-center gap-2 p-2.5">
        {avatarUrl ? (
          <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-white">
            <Image src={avatarUrl} alt="" fill sizes="28px" className="object-cover" />
          </span>
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            {(accountName ?? handle ?? "?").charAt(0).toUpperCase()}
          </span>
        )}
        <span className="truncate text-sm font-semibold text-foreground">{handle ? `@${handle}` : "Sin cuenta"}</span>
        <PlatformIcon platformKey="instagram" className="ml-auto size-4" style={{ color: "#E4405F" }} />
      </div>

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

      {/* Acciones básicas — sin conteos, no hay datos reales de engagement que mostrar. */}
      <div className="flex items-center gap-3 px-2.5 pt-2">
        <Heart className="size-5 text-foreground" />
        <MessageCircle className="size-5 text-foreground" />
        <Send className="size-5 text-foreground" />
        <MoreHorizontal className="ml-auto size-5 text-foreground" />
      </div>

      <div className="px-2.5 py-2">
        <p className="line-clamp-2 text-sm text-foreground">
          {handle && <span className="font-semibold">@{handle} </span>}
          {copy ? copy : <span className="text-muted-foreground">Sin copy</span>}
        </p>
      </div>
    </div>
  );
}
