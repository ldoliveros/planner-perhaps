"use client";

import type { CSSProperties } from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { Bell, Check, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { toastManager } from "@/lib/toast";

/**
 * Presentación de cada tipo de toast. El título visual es genérico y sale del tipo (los callsites no lo
 * pasan): el `title` que reciben `toast.success/error/info` se muestra como mensaje debajo.
 * `warning` está preparado visualmente (toastManager.add({ type: "warning" })) pero todavía no tiene
 * helper en lib/toast.ts ni callsites.
 */
const TYPE_CONFIG: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  success: { label: "¡Listo!", color: "#49D561", Icon: Check },
  error: { label: "Error", color: "#FF3459", Icon: X },
  info: { label: "Información", color: "#3085E8", Icon: Info },
  warning: { label: "Advertencia", color: "#FBC318", Icon: TriangleAlert },
  notification: { label: "Nueva notificación", color: "#3085E8", Icon: Bell },
};

// Sufijo hex de alfa ≈ 14 % para el fondo del círculo del ícono (0x24 / 0xFF).
const ICON_CIRCLE_ALPHA = "24";

const TOAST_LIMIT = 4;

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  // Base UI entrega el más reciente primero; se invierte para que cada toast nuevo aparezca debajo del anterior.
  return [...toasts].reverse().map((item) => {
    const { label, color, Icon } = TYPE_CONFIG[item.type ?? ""] ?? TYPE_CONFIG.info;
    return (
      <ToastPrimitive.Root
        key={item.id}
        toast={item}
        // Tarjeta blanca fija (no depende del tema); la barra izquierda queda recortada por el overflow/radius.
        className={cn(
          // Sin `border` real: el borde sutil es un anillo de 1px dentro del box-shadow, así la barra queda pegada al borde.
          "relative w-full shrink-0 overflow-hidden rounded-xl bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.06)] transition-all duration-200",
          // Alto explícito (el que mide Base UI; `auto` hasta medirlo) para poder animar el cierre: el toast que se va
          // colapsa su alto y el espacio del gap (-mb-2), y los demás suben suavemente en vez de saltar.
          "h-[var(--toast-height,auto)]",
          "data-starting-style:translate-x-4 data-starting-style:opacity-0",
          "data-ending-style:h-0 data-ending-style:-mb-2 data-ending-style:translate-x-4 data-ending-style:opacity-0",
          // Por encima del límite Base UI deja los más viejos inertes (sin poder usar "Deshacer"): no se muestran
          // hasta que se libera lugar (colapsados como al cerrar, así reaparecen con la misma transición).
          "data-limited:pointer-events-none data-limited:h-0 data-limited:-mb-2 data-limited:opacity-0"
        )}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-[5px]" style={{ backgroundColor: color }} />
        <div className="flex items-start gap-3 py-3 pr-2.5 pl-[21px]">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color}${ICON_CIRCLE_ALPHA}`, color } as CSSProperties}
          >
            <Icon className="size-[18px]" strokeWidth={2.5} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <p className="text-sm leading-tight font-semibold text-neutral-900">{label}</p>
            <ToastPrimitive.Title className="text-[13px] leading-snug font-normal break-words text-neutral-600" />
            {item.description && (
              <ToastPrimitive.Description className="text-[13px] leading-snug break-words text-neutral-500" />
            )}
            {item.actionProps && (
              <ToastPrimitive.Action className="mt-1 w-fit rounded-md text-[13px] font-semibold text-[#3085E8] hover:underline" />
            )}
          </div>
          <ToastPrimitive.Close
            className="-mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </ToastPrimitive.Close>
        </div>
      </ToastPrimitive.Root>
    );
  });
}

export function Toaster() {
  return (
    // Máximo de toasts visibles a la vez: la pila nunca se sale de la pantalla (también en mobile).
    <ToastPrimitive.Provider toastManager={toastManager} limit={TOAST_LIMIT}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          className="fixed top-4 right-4 z-100 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2"
          // Base UI pausa el autocierre mientras el puntero está sobre el viewport. Como los toasts aparecen
          // arriba a la derecha (donde quedan el cursor tras clickear Exportar CSV, el menú de usuario, etc.),
          // un cursor quieto los dejaba abiertos indefinidamente. Se desactiva solo la pausa por hover; la
          // pausa por foco de teclado y por ventana sin foco se mantiene.
          onMouseEnter={(event) => event.preventBaseUIHandler()}
          onMouseMove={(event) => event.preventBaseUIHandler()}
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
