"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "cn";
import { toastManager } from "@/lib/toast";

const TYPE_ICONS: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

// Success/error: fondo saturado con texto blanco (emerald-700 ≈ 5.5:1, red-600 ≈ 4.8:1 sobre blanco).
// Info conserva el estilo neutro de card. Ícono, título, descripción y cierre heredan el color por variante.
const TYPE_STYLES: Record<string, { root: string; icon: string; description: string; close: string }> = {
  success: {
    root: "border-emerald-800 bg-emerald-700 text-white",
    icon: "text-white",
    description: "text-white",
    close: "text-white hover:bg-white/20",
  },
  error: {
    root: "border-red-700 bg-red-600 text-white",
    icon: "text-white",
    description: "text-white",
    close: "text-white hover:bg-white/20",
  },
  info: {
    root: "border-border bg-card text-foreground",
    icon: "text-muted-foreground",
    description: "text-muted-foreground",
    close: "text-muted-foreground hover:bg-muted hover:text-foreground",
  },
};

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((item) => {
    const type = item.type && item.type in TYPE_STYLES ? item.type : "info";
    const styles = TYPE_STYLES[type];
    const Icon = TYPE_ICONS[type];
    return (
      <ToastPrimitive.Root
        key={item.id}
        toast={item}
        className={cn(
          "w-full rounded-lg border p-3 shadow-md transition-all duration-200",
          styles.root,
          "data-starting-style:-translate-y-2 data-starting-style:opacity-0",
          "data-ending-style:translate-x-4 data-ending-style:opacity-0"
        )}
      >
        <div className="flex items-start gap-2.5">
          <Icon className={cn("mt-0.5 size-4 shrink-0", styles.icon)} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <ToastPrimitive.Title className="text-sm font-medium" />
            {item.description && <ToastPrimitive.Description className={cn("text-xs", styles.description)} />}
          </div>
          <ToastPrimitive.Close
            className={cn("shrink-0 rounded-md p-0.5", styles.close)}
            aria-label="Cerrar"
          >
            <X className="size-3.5" />
          </ToastPrimitive.Close>
        </div>
      </ToastPrimitive.Root>
    );
  });
}

export function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={toastManager}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          className="fixed top-4 right-4 z-100 flex w-80 flex-col gap-2"
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
