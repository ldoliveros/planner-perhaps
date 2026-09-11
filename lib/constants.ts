import type { AccountType, ContentType, Platform, Status } from "@/types";

export const PLATFORMS: Platform[] = [
  { id: "instagram", key: "instagram", name: "Instagram", color: "#E4405F" },
  { id: "facebook", key: "facebook", name: "Facebook", color: "#1877F2" },
  { id: "linkedin", key: "linkedin", name: "LinkedIn", color: "#0A66C2" },
];

export const ACCOUNT_TYPES: AccountType[] = [
  { id: "empresa", key: "empresa", name: "Empresa" },
  { id: "personal", key: "personal", name: "Personal" },
];

export const CONTENT_TYPES: ContentType[] = [
  { id: "post", key: "post", label: "Post", order: 1 },
  { id: "reel", key: "reel", label: "Reel", order: 2 },
  { id: "story", key: "story", label: "Story", order: 3 },
  { id: "carousel", key: "carousel", label: "Carrusel", order: 4 },
  { id: "video", key: "video", label: "Video", order: 5 },
  { id: "article", key: "article", label: "Artículo", order: 6 },
  { id: "other", key: "other", label: "Otro", order: 7 },
];

export const STATUSES: Status[] = [
  { id: "idea", key: "idea", label: "Idea", color: "#94A3B8", order: 1 },
  { id: "in_production", key: "in_production", label: "En producción", color: "#3B82F6", order: 2 },
  { id: "in_review", key: "in_review", label: "Listo para revisión", color: "#F59E0B", order: 3 },
  { id: "approved", key: "approved", label: "Aprobado", color: "#8B5CF6", order: 4 },
  { id: "published", key: "published", label: "Publicado", color: "#22C55E", order: 5 },
  { id: "cancelled", key: "cancelled", label: "Cancelado", color: "#EF4444", order: 6 },
];

export function getPlatform(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

export function getAccountType(id: string): AccountType | undefined {
  return ACCOUNT_TYPES.find((a) => a.id === id);
}

export function getContentType(id: string): ContentType | undefined {
  return CONTENT_TYPES.find((c) => c.id === id);
}

export function getStatus(id: string): Status | undefined {
  return STATUSES.find((s) => s.id === id);
}
