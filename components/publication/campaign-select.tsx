"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createOrGetCampaign } from "@/lib/actions/campaigns";
import { toast } from "@/lib/toast";
import type { Campaign } from "@/types";

const NONE = "__none__";
const NEW = "__new__";

interface CampaignSelectProps {
  clientId: string;
  campaigns: Campaign[];
  value: string;
  onChange: (campaignId: string) => void;
  onCreated: (campaign: Campaign) => void;
}

/**
 * Selector de Campaña: "Sin campaña" + campañas activas del cliente (más la
 * actual aunque esté archivada, para no perder la asociación al editar una
 * publicación histórica) + "+ Nueva campaña". El valor real para el form se
 * envía vía el hidden input que arma PublicationForm — este componente solo
 * expone ids reales a onChange (nunca los sentinels internos del Select).
 */
export function CampaignSelect({ clientId, campaigns, value, onChange, onCreated }: CampaignSelectProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, setIsPending] = useState(false);

  const options = campaigns.filter((c) => !c.archivedAt || c.id === value);

  function handleValueChange(next: string) {
    if (next === NEW) {
      setCreating(true);
      return;
    }
    onChange(next === NONE ? "" : next);
  }

  async function handleCreate() {
    if (isPending) return; // evita doble creación por doble click
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsPending(true);
    const result = await createOrGetCampaign(clientId, trimmed);
    setIsPending(false);
    if (result.error || !result.campaign) {
      toast.error("No se pudo crear la campaña", result.error ?? "Intentá de nuevo.");
      return;
    }
    onCreated({ id: result.campaign.id, clientId, name: result.campaign.name, archivedAt: null });
    onChange(result.campaign.id);
    setNewName("");
    setCreating(false);
    toast.success(`Campaña "${result.campaign.name}" lista`);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={value || NONE}
        onValueChange={(v) => handleValueChange(v as string)}
        items={{
          [NONE]: "Sin campaña",
          ...Object.fromEntries(options.map((c) => [c.id, c.name])),
          [NEW]: "+ Nueva campaña",
        }}
      >
        <SelectTrigger id="campaignId" className="w-full">
          <SelectValue placeholder="Sin campaña" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin campaña</SelectItem>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {c.archivedAt && <span className="text-muted-foreground">(archivada)</span>}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={NEW}>
            <Plus className="size-3.5" />
            Nueva campaña
          </SelectItem>
        </SelectContent>
      </Select>

      {creating && (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            placeholder="Nombre de la campaña"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setCreating(false);
                setNewName("");
              }
            }}
          />
          <Button type="button" size="sm" disabled={!newName.trim() || isPending} onClick={handleCreate}>
            {isPending ? "Creando..." : "Crear"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
