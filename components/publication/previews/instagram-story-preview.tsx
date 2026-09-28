"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Instagram Story. A diferencia del Reel (que sí recorta a pantalla completa, imitando
 * video), acá la portada NUNCA se recorta de forma destructiva: siempre object-contain sobre fondo
 * negro neutro, aunque su proporción no sea 9:16 exacta. Formato fijo 9:16 (no detecta aspect-ratio como
 * Post/Carrusel — Story siempre es vertical). Sin reproducción/subida de video. El acceso a Drive vive
 * fuera del preview (PublicationView, debajo) — esto es solo la simulación visual.
 */
export function InstagramStoryPreview({ coverUrl, handle, accountName, avatarUrl }: PublicationPreviewProps) {
  return (
    <div className="relative mx-auto aspect-9/16 w-full max-w-[300px] overflow-hidden rounded-2xl bg-black shadow-lg">
      {coverUrl ? (
        <Image src={coverUrl} alt="" fill sizes="300px" className="object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center bg-muted">
          <ImageIcon className="size-12 text-muted-foreground/40" />
        </div>
      )}

      {/* Barra de progreso — un solo segmento, la portada representa una única placa de Story. */}
      <div className="absolute inset-x-2 top-2 h-0.5 overflow-hidden rounded-full bg-white/30">
        <div className="h-full w-full rounded-full bg-white" />
      </div>

      <div className="absolute inset-x-0 top-4 flex items-center gap-2 px-3">
        {avatarUrl ? (
          <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-white/40">
            <Image src={avatarUrl} alt="" fill sizes="28px" className="object-cover" />
          </span>
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white ring-1 ring-white/40">
            {(accountName ?? handle ?? "?").charAt(0).toUpperCase()}
          </span>
        )}
        <span className="truncate text-sm font-semibold text-white drop-shadow">
          {handle ? `@${handle}` : "Sin cuenta"}
        </span>
        <PlatformIcon platformKey="instagram" className="ml-auto size-4 drop-shadow" style={{ color: "#ffffff" }} />
      </div>
    </div>
  );
}
