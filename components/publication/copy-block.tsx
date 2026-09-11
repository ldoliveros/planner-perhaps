"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyBlock({ copy }: { copy: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

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
