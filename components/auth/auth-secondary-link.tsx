import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface AuthSecondaryLinkProps {
  question: string;
  label: string;
  href: string;
}

/** Acceso cruzado discreto al pie del panel (Cliente <-> Equipo interno). */
export function AuthSecondaryLink({ question, label, href }: AuthSecondaryLinkProps) {
  return (
    <div className="mt-12 flex flex-col items-center gap-1 border-t border-border pt-6 text-center text-sm">
      <span className="text-muted-foreground">{question}</span>
      <Link
        href={href}
        className="inline-flex items-center gap-1 font-medium text-[#26a9e0] hover:underline"
      >
        {label}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
