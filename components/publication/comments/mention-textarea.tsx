"use client";

import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "cn";
import { mentionQueryAt, normalizeForSearch as normalize, type SelectedMention } from "@/lib/mentions";
import type { MentionableMember } from "@/types";

export type { SelectedMention };

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  mentions: SelectedMention[];
  onMentionsChange: (mentions: SelectedMention[]) => void;
  /** Mencionables del cliente (cargados por el panel). null = todavía cargando / no disponibles. */
  members: MentionableMember[] | null;
  /** Se pide la lista recién al escribir "@" por primera vez. */
  onNeedMembers: () => void;
  onSubmitShortcut: () => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel: string;
  /** Acceso al textarea (p. ej. "Responder" lo enfoca y ubica el cursor después de la mención insertada). */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Textarea con selector de menciones: al escribir "@" sugiere usuarios autorizados del cliente (nombre +
 * avatar) — la lista viene de list_mentionable_members, que ya filtra por cliente, actividad y asignación. Al
 * elegir uno se inserta "@Nombre " y se registra su id. La base vuelve a validar las menciones al guardar
 * (sanitize_mentions): elegir a alguien no autorizado por otra vía no tiene efecto.
 * Teclado: ↑/↓ para moverse, Enter/Tab para elegir, Escape para cerrar; Ctrl/Cmd+Enter envía.
 */
export function MentionTextarea({
  value,
  onChange,
  mentions,
  onMentionsChange,
  members,
  onNeedMembers,
  onSubmitShortcut,
  disabled,
  placeholder,
  autoFocus,
  ariaLabel,
  textareaRef: externalRef,
}: MentionTextareaProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions =
    query && members
      ? members.filter((m) => normalize(m.fullName).includes(normalize(query.query))).slice(0, 6)
      : [];
  const pickerOpen = query !== null;

  function updateQuery(nextValue: string, caret: number) {
    const next = mentionQueryAt(nextValue, caret);
    setQuery(next);
    setActiveIndex(0);
    if (next && members === null) onNeedMembers();
  }

  function choose(member: MentionableMember) {
    if (!query) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const insertion = `@${member.fullName} `;
    const nextValue = value.slice(0, query.start) + insertion + value.slice(caret);
    onChange(nextValue);
    if (!mentions.some((m) => m.id === member.id)) {
      onMentionsChange([...mentions, { id: member.id, name: member.fullName }]);
    }
    setQuery(null);
    const nextCaret = query.start + insertion.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmitShortcut();
      return;
    }
    if (!pickerOpen) return;
    if (e.key === "Escape") {
      // Cierra solo el selector, no la Vista de Publicación.
      e.preventDefault();
      e.stopPropagation();
      setQuery(null);
      return;
    }
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(suggestions[Math.min(activeIndex, suggestions.length - 1)]);
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        rows={3}
        maxLength={5000}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => updateQuery(value, e.currentTarget.selectionStart ?? value.length)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        aria-expanded={pickerOpen}
        aria-autocomplete="list"
        className="min-h-20 resize-y text-sm"
      />
      {pickerOpen && (
        <div
          role="listbox"
          aria-label="Mencionar a"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
        >
          {members === null ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Cargando usuarios...</p>
          ) : suggestions.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Ningún usuario autorizado coincide.</p>
          ) : (
            suggestions.map((member, index) => (
              <button
                key={member.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                // mousedown (no click): elige antes de que el blur del textarea cierre la lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(member);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  index === activeIndex ? "bg-muted" : "hover:bg-muted/60"
                )}
              >
                <UserAvatar fullName={member.fullName} email={null} avatarUrl={member.avatarUrl} size={22} />
                <span className="truncate">{member.fullName}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {member.role === "client" ? "Cliente" : "Agencia"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
