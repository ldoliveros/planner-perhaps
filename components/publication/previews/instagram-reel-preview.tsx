"use client";

import Image from "next/image";
import { Heart, ImageIcon, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Instagram Reel. No es réplica pixel-perfect: no hay conteos de likes/comentarios
 * porque Planner no tiene esos datos (no inventamos números). Busca ser reconocible como Reel: portada
 * 9:16 a pantalla completa, cuenta+copy abajo a la izquierda, columna de acciones a la derecha. El
 * acceso a Drive vive fuera del preview (PublicationView, debajo) — esto es solo la simulación visual.
 */
export function InstagramReelPreview({ coverUrl, handle, accountName, copy, avatarUrl }: PublicationPreviewProps) {
  return (
    <div className="relative mx-auto aspect-9/16 w-full max-w-[300px] overflow-hidden rounded-2xl bg-black shadow-lg">
      {coverUrl ? (
        <Image src={coverUrl} alt="" fill sizes="300px" className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center bg-muted">
          <ImageIcon className="size-12 text-muted-foreground/40" />
        </div>
      )}

      {/* Degradado inferior sutil: solo lo necesario para que el texto/iconos blancos sean legibles sobre la portada. */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      <PlatformIcon
        platformKey="instagram"
        className="absolute top-3 right-3 size-4 drop-shadow"
        style={{ color: "#ffffff" }}
      />

      {/* Columna de acciones — solo iconos, sin conteos (no hay datos reales de engagement que mostrar). */}
      <div className="absolute right-3 bottom-16 flex flex-col items-center gap-4 text-white">
        <Heart className="size-6 drop-shadow" />
        <MessageCircle className="size-6 drop-shadow" />
        <Send className="size-6 drop-shadow" />
        <MoreHorizontal className="size-6 drop-shadow" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3 pr-14">
        <div className="mb-1.5 flex items-center gap-2">
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
        </div>
        <p className="line-clamp-2 text-sm text-white drop-shadow">
          {copy ? copy : <span className="text-white/60">Sin copy</span>}
        </p>
      </div>
    </div>
  );
}
