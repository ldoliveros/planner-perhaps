"use client";

import Image from "next/image";
import { Heart, ImageIcon, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useImageAspectRatio } from "./use-image-aspect-ratio";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Instagram Post. Mismo lenguaje visual que Carrusel/Reel: formato feed (no 9:16),
 * mismo hook de aspect-ratio (4:5/1:1/1.91:1, detectado de la portada real), sin conteos inventados.
 * El acceso a Drive vive fuera del preview (PublicationView, debajo) — esto es solo la simulación visual.
 */
export function InstagramPostPreview({ coverUrl, handle, accountName, copy }: PublicationPreviewProps) {
  const frameRatio = useImageAspectRatio(coverUrl);

  return (
    <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
      <div className="flex items-center gap-2 p-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
          {(accountName ?? handle ?? "?").charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold text-foreground">{handle ? `@${handle}` : "Sin cuenta"}</span>
        <PlatformIcon platformKey="instagram" className="ml-auto size-4" style={{ color: "#E4405F" }} />
      </div>

      <div className="relative w-full bg-black" style={{ aspectRatio: frameRatio }}>
        {coverUrl ? (
          <Image src={coverUrl} alt="" fill sizes="320px" className="object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted">
            <ImageIcon className="size-10 text-muted-foreground/40" />
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
