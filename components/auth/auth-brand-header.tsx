import { PerhapsLogo } from "@/components/branding/perhaps-logo";

export function AuthBrandHeader() {
  return (
    <div className="mb-10 flex flex-col items-start gap-3">
      <PerhapsLogo height={56} />
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Planificador editorial
      </span>
    </div>
  );
}
