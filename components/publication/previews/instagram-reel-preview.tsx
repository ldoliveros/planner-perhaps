"use client";

import Image from "next/image";
import { Heart, ImageIcon, MessageCircle, MoreHorizontal, Play, Send } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { cn } from "cn";
import type { PublicationPreviewProps } from "./types";

/**
 * Preview piloto — Instagram Reel. No es réplica pixel-perfect: no hay conteos de likes/comentarios
 * porque Planner no tiene esos datos (no inventamos números). Busca ser reconocible como Reel: portada
 * 9:16 a pantalla completa, cuenta+copy abajo a la izquierda, columna de acciones a la derecha, ▶
 * central que abre `driveFolderUrl` (Planner no guarda ni reproduce video).
 */
export function InstagramReelPreview({ coverUrl, handle, accountName, copy, driveFolderUrl }: PublicationPreviewProps) {
  const canOpenDrive = Boolean(driveFolderUrl);

  function handlePlayClick() {
    if (!driveFolderUrl) return;
    window.open(driveFolderUrl, "_blank", "noopener,noreferrer");
  }

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

      {/* Control discreto para abrir el material en Drive — no un play grande simulando reproducción. */}
      <div className="absolute top-3 left-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={handlePlayClick}
                disabled={!canOpenDrive}
                aria-label="Ver material en Drive"
                className={cn(
                  "flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/40 backdrop-blur-sm transition-transform",
                  canOpenDrive ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-40"
                )}
              />
            }
          >
            <Play className="size-3 fill-white text-white" />
            Ver material
          </TooltipTrigger>
          <TooltipContent side="bottom">Ver material en Drive</TooltipContent>
        </Tooltip>
      </div>

      {/* Columna de acciones — solo iconos, sin conteos (no hay datos reales de engagement que mostrar). */}
      <div className="absolute right-3 bottom-16 flex flex-col items-center gap-4 text-white">
        <Heart className="size-6 drop-shadow" />
        <MessageCircle className="size-6 drop-shadow" />
        <Send className="size-6 drop-shadow" />
        <MoreHorizontal className="size-6 drop-shadow" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3 pr-14">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white ring-1 ring-white/40">
            {(accountName ?? handle ?? "?").charAt(0).toUpperCase()}
          </span>
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
