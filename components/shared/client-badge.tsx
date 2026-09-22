import Image from "next/image";
import { cn } from "cn";
import { getContrastTextColor } from "@/lib/color-contrast";
import type { Client } from "@/types";

/**
 * Identificación de cliente (logo + nombre) reutilizada en Publicaciones (calendario global) — Semana, Mes,
 * Lista y mobile. Información secundaria respecto del título de la publicación: nunca reemplaza el color de
 * estado como sistema de identificación, solo dice "de qué cliente es este contenido".
 *
 * - "xs": Mes (chip muy compacto) — logo redondo mínimo, sin borde.
 * - "sm": Semana / cards compactas de mobile.
 * - "md": Lista desktop (hay más espacio: logo/nombre más legibles, siguen siendo secundarios frente al título).
 */
const SIZE_CLASSES = {
  xs: { logo: "size-3", text: "text-[9px]", gap: "gap-0.5" },
  sm: { logo: "size-3.5", text: "text-[10px]", gap: "gap-1" },
  md: { logo: "size-4", text: "text-xs", gap: "gap-1.5" },
} as const;

interface ClientBadgeProps {
  client: Pick<Client, "name" | "logoUrl" | "color">;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function ClientBadge({ client, size = "sm", className }: ClientBadgeProps) {
  const { logo, text, gap } = SIZE_CLASSES[size];
  return (
    <span className={cn("flex min-w-0 items-center", gap, className)} title={client.name}>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold leading-none",
          logo
        )}
        style={client.logoUrl ? undefined : { backgroundColor: client.color, color: getContrastTextColor(client.color) }}
      >
        {client.logoUrl ? (
          <Image src={client.logoUrl} alt="" fill sizes="20px" className="object-cover" />
        ) : (
          <span style={{ fontSize: "0.6em" }}>{client.name.charAt(0)}</span>
        )}
      </span>
      <span className={cn("min-w-0 truncate font-medium text-muted-foreground", text)}>{client.name}</span>
    </span>
  );
}
