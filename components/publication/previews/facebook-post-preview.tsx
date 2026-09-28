"use client";

import Image from "next/image";
import { ImageIcon, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useImageAspectRatio } from "./use-image-aspect-ratio";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Facebook Post. Mismo lenguaje visual/escala que los previews de Instagram (mismo
 * hook de aspect-ratio), pero con patrones reconocibles de Facebook: el nombre de cuenta se muestra sin
 * "@" (Facebook no usa esa convención), el copy va ARRIBA de la imagen (al revés que Instagram) y las
 * acciones tienen ícono + etiqueta fija ("Me gusta"/"Comentar"/"Compartir" — texto estático, nunca
 * conteos inventados). El acceso a Drive vive fuera del preview (PublicationView, debajo).
 */
export function FacebookPostPreview({ coverUrl, handle, accountName, copy, avatarUrl }: PublicationPreviewProps) {
  const frameRatio = useImageAspectRatio(coverUrl);
  const displayName = accountName ?? handle ?? "Sin cuenta";

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
        {coverUrl ? (
          <Image src={coverUrl} alt="" fill sizes="320px" className="object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted">
            <ImageIcon className="size-10 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Ícono + etiqueta fija — patrón reconocible de Facebook, sin conteos inventados. */}
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
