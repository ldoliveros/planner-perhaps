import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

/** Pill "Desactivado"/"Archivado" compacto (rojo suave + punto), equivalente inverso de ActiveStatusBadge. */
export function InactiveStatusBadge({ label, className }: { label: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-red-500" />
      {label}
    </Badge>
  );
}
