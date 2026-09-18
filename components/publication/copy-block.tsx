"use client";

import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { toast } from "@/lib/toast";

export function CopyBlock({ copy }: { copy: string }) {
  const { copied, copy: copyText } = useCopyToClipboard();

  async function handleCopy() {
    const ok = await copyText(copy);
    if (ok) {
      toast.success("Copy copiado ✓");
    } else {
      toast.error("No se pudo copiar", "Tu navegador bloqueó el acceso al portapapeles.");
    }
  }

  if (!copy) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Copy</span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
          {copied ? <Check className="text-green-600" /> : <Copy />}
          {copied ? "Copiado" : "Copiar copy"}
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{copy}</p>
    </div>
  );
}
