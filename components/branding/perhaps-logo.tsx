import Image from "next/image";
import { cn } from "cn";

interface PerhapsLogoProps {
  className?: string;
  height?: number;
}

/**
 * Logo de la agencia. Para reemplazarlo alcanza con sobreescribir
 * public/brand/perhaps-logo.svg (o .png) con el mismo nombre de archivo —
 * este componente no necesita cambios.
 */
export function PerhapsLogo({ className, height = 20 }: PerhapsLogoProps) {
  const width = Math.round(height * 3.7);
  return (
    <Image
      src="/brand/perhaps-logo.svg"
      alt="Perhaps"
      width={width}
      height={height}
      priority
      className={cn("h-auto w-auto", className)}
      style={{ height }}
    />
  );
}
