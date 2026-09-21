"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface EmojiGroup {
  label: string;
  emojis: string[];
}

// Seleccion liviana y curada para comunicacion/redes sociales — no reemplaza
// el picker completo del sistema operativo, alcanza para el uso real de un
// editor de copy (evita cargar una libreria pesada tipo emoji-mart).
const EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: "Expresiones",
    emojis: ["😀", "😄", "😁", "😂", "🤣", "😊", "🙂", "😉", "😍", "🥰", "😘", "😎", "🤔", "😅", "😢", "😭", "😡", "🥳", "😴", "🤯"],
  },
  {
    label: "Gestos",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "💪", "👋", "🤝", "✌️", "🤞", "👌", "🤙", "💅", "🫶"],
  },
  {
    label: "Celebración",
    emojis: ["🎉", "🎊", "🥳", "🎁", "🏆", "🥇", "✨", "🔥", "💯", "🚀"],
  },
  {
    label: "Símbolos",
    emojis: ["❤️", "💙", "💚", "💛", "🧡", "💜", "🖤", "🤍", "💕", "⭐", "⚡", "💥"],
  },
  {
    label: "Flechas / check",
    emojis: ["➡️", "⬅️", "⬆️", "⬇️", "✅", "☑️", "✔️", "❌", "❗", "❓"],
  },
  {
    label: "Objetos frecuentes",
    emojis: ["📸", "📱", "💻", "📅", "📍", "🔗", "📈", "📝", "🕒", "🎯"],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            title="Emoji"
            aria-label="Insertar emoji"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-10"
          />
        }
      >
        <Smile className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelect(emoji);
                      setOpen(false);
                    }}
                    aria-label={`Insertar ${emoji}`}
                    className="flex size-7 items-center justify-center rounded-md text-lg leading-none transition-colors hover:bg-muted pointer-coarse:size-8"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
