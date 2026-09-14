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

const TYPE_COLORS: Record<string, string> = {
  success: "text-primary",
  error: "text-destructive",
  info: "text-muted-foreground",
};

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((item) => {
    const Icon = TYPE_ICONS[item.type ?? ""] ?? Info;
    return (
      <ToastPrimitive.Root
        key={item.id}
        toast={item}
        className={cn(
          "w-full rounded-lg border border-border bg-card p-3 shadow-md transition-all duration-200",
          "data-starting-style:translate-y-2 data-starting-style:opacity-0",
          "data-ending-style:translate-x-4 data-ending-style:opacity-0"
        )}
      >
        <div className="flex items-start gap-2.5">
          <Icon className={cn("mt-0.5 size-4 shrink-0", TYPE_COLORS[item.type ?? ""])} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <ToastPrimitive.Title className="text-sm font-medium text-foreground" />
            {item.description && <ToastPrimitive.Description className="text-xs text-muted-foreground" />}
          </div>
          <ToastPrimitive.Close
            className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-100 flex w-80 flex-col-reverse gap-2">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
