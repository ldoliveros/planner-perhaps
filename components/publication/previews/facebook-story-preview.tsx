"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Facebook Story. Misma estructura que Instagram Story (formato fijo 9:16, portada
 * NUNCA recortada de forma destructiva — object-contain sobre fondo negro neutro si la proporción no es
 * exactamente 9:16), con la variación reconocible de Facebook: nombre de cuenta sin "@". Sin
 * reproducción/subida de video. El acceso a Drive vive fuera del preview (PublicationView, debajo).
 */
export function FacebookStoryPreview({ coverUrl, handle, accountName }: PublicationPreviewProps) {
  const displayName = accountName ?? handle ?? "Sin cuenta";

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
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white ring-1 ring-white/40">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold text-white drop-shadow">{displayName}</span>
        <PlatformIcon platformKey="facebook" className="ml-auto size-4 drop-shadow" style={{ color: "#ffffff" }} />
      </div>
    </div>
  );
}
