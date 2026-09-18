"use client";

import { useRef, useState } from "react";
import { Check, Copy as CopyIcon, Link as LinkIcon, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmojiPicker } from "@/components/publication/emoji-picker";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { toast } from "@/lib/toast";

interface CopyEditorProps {
  id: string;
  name: string;
  defaultValue: string;
}

function lineBoundsAround(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return { lineStart, lineEnd };
}

// Saca un prefijo de viñeta o numeración previo — así alternar entre lista
// con viñetas y lista numerada sobre el mismo bloque da un resultado limpio
// en vez de apilar prefijos ("1. • Primer punto").
function stripListPrefix(line: string): string {
  return line.replace(/^(?:•\s|\d+\.\s)/, "");
}

/**
 * Editor de Copy sobre texto plano (publications.copy sigue siendo TEXT).
 * La toolbar solo ayuda a construir el string: nunca guarda HTML/Markdown,
 * nunca convierte a rich text. Todas las inserciones son cursor-aware.
 */
export function CopyEditor({ id, name, defaultValue }: CopyEditorProps) {
  // El <textarea> del DOM normaliza \r\n/\r a \n en su .value (selectionStart/End
  // se calculan sobre esa versión normalizada). Si el estado de React conservara los
  // \r originales (p. ej. un Copy guardado antes con saltos de línea estilo Windows),
  // los índices de cursor quedarían desalineados y las inserciones/listas cortarían
  // el texto en la posición equivocada. Se normaliza una sola vez, al cargar.
  const [value, setValue] = useState(() => defaultValue.replace(/\r\n?/g, "\n"));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const { copied, copy: copyText } = useCopyToClipboard();

  function focusAndSelect(pos: number, selectEnd?: number) {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, selectEnd ?? pos);
    });
  }

  /** Inserta texto en la posición actual del cursor, reemplazando cualquier selección. */
  function insertAtCursor(insertText: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + insertText + value.slice(end);
    setValue(next);
    focusAndSelect(start + insertText.length);
  }

  function handleBulletList() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;

    if (start === end) {
      const { lineStart, lineEnd } = lineBoundsAround(value, start, end);
      const line = value.slice(lineStart, lineEnd);
      if (line.startsWith("• ")) return; // ya tiene viñeta, no duplicar
      const rest = stripListPrefix(line);
      const next = value.slice(0, lineStart) + "• " + rest + value.slice(lineEnd);
      setValue(next);
      focusAndSelect(lineStart + 2);
      return;
    }

    const { lineStart, lineEnd } = lineBoundsAround(value, start, end);
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const transformed = lines.map((line) => `• ${stripListPrefix(line)}`).join("\n");
    const next = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
    setValue(next);
    focusAndSelect(lineStart, lineStart + transformed.length);
  }

  function handleNumberedList() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;

    if (start === end) {
      const { lineStart, lineEnd } = lineBoundsAround(value, start, end);
      const line = value.slice(lineStart, lineEnd);
      const rest = stripListPrefix(line);
      const next = value.slice(0, lineStart) + "1. " + rest + value.slice(lineEnd);
      setValue(next);
      focusAndSelect(lineStart + 3);
      return;
    }

    const { lineStart, lineEnd } = lineBoundsAround(value, start, end);
    const lines = value.slice(lineStart, lineEnd).split("\n");
    // Saca cualquier viñeta/numeracion previa antes de renumerar, para que
    // aplicar el control de nuevo sobre el mismo bloque sea predecible.
    const stripped = lines.map(stripListPrefix);
    const transformed = stripped.map((line, i) => `${i + 1}. ${line}`).join("\n");
    const next = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
    setValue(next);
    focusAndSelect(lineStart, lineStart + transformed.length);
  }

  function handleInsertLink() {
    const trimmed = linkUrl.trim();
    if (!trimmed) return;
    insertAtCursor(trimmed);
    setLinkUrl("");
    setLinkOpen(false);
  }

  async function handleCopy() {
    const ok = await copyText(value);
    if (ok) {
      toast.success("Copy copiado ✓");
    } else {
      toast.error("No se pudo copiar", "Tu navegador bloqueó el acceso al portapapeles.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <EmojiPicker onSelect={insertAtCursor} />

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={handleBulletList}
                  aria-label="Lista con viñetas"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                />
              }
            >
              <List className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top">Lista con viñetas</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={handleNumberedList}
                  aria-label="Lista numerada"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                />
              }
            >
              <ListOrdered className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top">Lista numerada</TooltipContent>
          </Tooltip>

          <Popover open={linkOpen} onOpenChange={setLinkOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  title="Insertar link"
                  aria-label="Insertar link"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                />
              }
            >
              <LinkIcon className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3">
              <div className="flex flex-col gap-2">
                <label htmlFor={`${id}-link-url`} className="text-xs font-medium text-foreground">
                  URL
                </label>
                <Input
                  id={`${id}-link-url`}
                  type="url"
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleInsertLink();
                    }
                  }}
                  autoFocus
                />
                <Button type="button" size="sm" disabled={!linkUrl.trim()} onClick={handleInsertLink}>
                  Insertar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          disabled={!value.trim()}
          onClick={handleCopy}
        >
          {copied ? <Check className="text-green-600" /> : <CopyIcon />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>

      <Textarea
        id={id}
        name={name}
        ref={textareaRef}
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      <span className="self-end text-xs text-muted-foreground">{value.length} caracteres</span>
    </div>
  );
}
