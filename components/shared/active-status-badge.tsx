import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

/** Pill "Activo" compacto (verde suave + punto) reutilizado por filas de Cliente y Calendario. */
export function ActiveStatusBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-green-500" />
      Activo
    </Badge>
  );
}
