import { PlannerLogo } from "@/components/branding/planner-logo";

export function AuthBrandHeader() {
  return (
    <div className="mb-10 flex flex-col items-start gap-3">
      <PlannerLogo variant="full" height={72} priority />
      <span className="text-sm text-muted-foreground">Ideas en orden. Contenido en movimiento.</span>
    </div>
  );
}
