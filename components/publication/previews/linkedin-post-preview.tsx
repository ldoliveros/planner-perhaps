"use client";

import Image from "next/image";
import { ImageIcon, MessageCircle, Repeat2, Send, ThumbsUp } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useImageAspectRatio } from "./use-image-aspect-ratio";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — LinkedIn Post. Mismo lenguaje visual/escala que Facebook Post (mismo hook de
 * aspect-ratio, copy arriba de la imagen, nombre sin "@"), con las variaciones reconocibles de LinkedIn:
 * cuatro acciones ("Recomendar"/"Comentar"/"Compartir"/"Enviar" — texto estático, sin conteos
 * inventados). El acceso a Drive vive fuera del preview (PublicationView, debajo).
 */
export function LinkedinPostPreview({ coverUrl, handle, accountName, copy, avatarUrl }: PublicationPreviewProps) {
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
        <PlatformIcon platformKey="linkedin" className="ml-auto size-4" style={{ color: "#0A66C2" }} />
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

      {/* Cuatro acciones con ícono + etiqueta fija — patrón reconocible de LinkedIn, sin conteos inventados.
          Son una más que Facebook (Recomendar/Comentar/Compartir/Enviar), así que van más compactas para
          entrar en los mismos 320px sin recortar texto ni envolver línea. */}
      <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
        <span className="flex items-center gap-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
          <ThumbsUp className="size-3.5" />
          Recomendar
        </span>
        <span className="flex items-center gap-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
          <MessageCircle className="size-3.5" />
          Comentar
        </span>
        <span className="flex items-center gap-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
          <Repeat2 className="size-3.5" />
          Compartir
        </span>
        <span className="flex items-center gap-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
          <Send className="size-3.5" />
          Enviar
        </span>
      </div>
    </div>
  );
}
