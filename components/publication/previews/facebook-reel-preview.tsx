"use client";

import Image from "next/image";
import { ImageIcon, MessageCircle, MoreHorizontal, Share2, ThumbsUp } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Facebook Reel. Misma estructura que Instagram Reel (Facebook copió ese formato tal
 * cual: portada 9:16 a pantalla completa, columna de acciones a la derecha, cuenta+copy abajo), con las
 * variaciones reconocibles de Facebook: ícono de "Me gusta" (pulgar) en vez de corazón, nombre de cuenta
 * sin "@". Sin conteos inventados. No reproduce video. El acceso a Drive vive fuera del preview
 * (PublicationView, debajo).
 */
export function FacebookReelPreview({ coverUrl, handle, accountName, copy }: PublicationPreviewProps) {
  const displayName = accountName ?? handle ?? "Sin cuenta";

  return (
    <div className="relative mx-auto aspect-9/16 w-full max-w-[300px] overflow-hidden rounded-2xl bg-black shadow-lg">
      {coverUrl ? (
        <Image src={coverUrl} alt="" fill sizes="300px" className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center bg-muted">
          <ImageIcon className="size-12 text-muted-foreground/40" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      <PlatformIcon
        platformKey="facebook"
        className="absolute top-3 right-3 size-4 drop-shadow"
        style={{ color: "#ffffff" }}
      />

      <div className="absolute right-3 bottom-16 flex flex-col items-center gap-4 text-white">
        <ThumbsUp className="size-6 drop-shadow" />
        <MessageCircle className="size-6 drop-shadow" />
        <Share2 className="size-6 drop-shadow" />
        <MoreHorizontal className="size-6 drop-shadow" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3 pr-14">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white ring-1 ring-white/40">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm font-semibold text-white drop-shadow">{displayName}</span>
        </div>
        <p className="line-clamp-2 text-sm text-white drop-shadow">
          {copy ? copy : <span className="text-white/60">Sin copy</span>}
        </p>
      </div>
    </div>
  );
}
