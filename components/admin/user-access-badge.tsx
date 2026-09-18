import { Badge } from "@/components/ui/badge";
import { ACCESS_STATUS_LABELS } from "@/lib/user-access";
import type { UserAccessStatus } from "@/types";

const VARIANTS: Record<UserAccessStatus, "secondary" | "outline" | "destructive"> = {
  active: "secondary",
  invited: "outline",
  disabled: "destructive",
};

/** Pill de estado de acceso: Activo / Invitado / Desactivado. */
export function UserAccessBadge({ status }: { status: UserAccessStatus }) {
  return <Badge variant={VARIANTS[status]}>{ACCESS_STATUS_LABELS[status]}</Badge>;
}
