"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_ACTIONS_RESERVE } from "@/lib/admin-shell";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "cn";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

/** Carga inicial del dashboard de Inicio (los cambios de filtro mantienen la vista anterior atenuada). */
export function DashboardSkeleton() {
  return (
    <div className={cn("flex min-h-full flex-col gap-5 p-4 md:p-6", ADMIN_SURFACE)} aria-busy="true" aria-label="Cargando Escritorio">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 md:-mt-1.5", ADMIN_ACTIONS_RESERVE)}>
        <Block className="h-8 w-40 rounded-lg" />
        <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row">
          <Block className="h-11 w-full rounded-xl sm:w-64" />
          <Block className="h-11 w-full rounded-xl sm:w-72" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-24" />
        ))}
      </div>
      <Block className="h-32" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block className="h-80" />
        <Block className="h-80" />
      </div>
    </div>
  );
}

/** Falla al cargar los datos del dashboard: mensaje y reintento (vuelve a pedir el Server Component). */
export function DashboardError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("flex min-h-full items-center justify-center p-6", ADMIN_SURFACE)}>
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        <AlertTriangle className="size-6 text-destructive" />
        <p className="text-sm font-medium text-foreground">No se pudo cargar el Escritorio</p>
        <p className="text-sm text-muted-foreground">Revisá la conexión y volvé a intentar.</p>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
          <RefreshCcw className="size-3.5" />
          {pending ? "Reintentando..." : "Reintentar"}
        </Button>
      </div>
    </div>
  );
}
