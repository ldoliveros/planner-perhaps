export type CalendarStatus = "draft" | "active" | "archived";

export type UserRole = "super_admin" | "account_manager" | "client";

/** Estado de acceso derivado de Supabase Auth (no se guarda en DB). */
export type UserAccessStatus = "active" | "invited" | "disabled";

export interface ClientUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  clientId: string | null;
  createdAt: string;
  /** Solo lo resuelve un Super Admin (requiere la Auth Admin API); ausente si no se pudo o no corresponde. */
  accessStatus?: UserAccessStatus;
}

export interface TeamMember {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: "super_admin" | "account_manager";
  assignedClients: { id: string; name: string }[];
  active: boolean;
  accessStatus: UserAccessStatus;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  color: string;
  active: boolean;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
}

export interface Calendar {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description: string | null;
  status: CalendarStatus;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
}

export interface Platform {
  id: string;
  key: string;
  name: string;
  color: string;
  requiresAccountType: boolean;
}

export interface AccountType {
  id: string;
  key: string;
  name: string;
}

export interface ClientAccount {
  id: string;
  clientId: string;
  platformId: string;
  /** Handle sin "@": identificador principal y obligatorio de la cuenta (el "@" es solo presentación). */
  handle: string;
  /** Nombre opcional y secundario. */
  name: string | null;
  url: string | null;
  accountTypeId: string | null;
  active: boolean;
  sortOrder: number;
}

export interface PublicationDestination {
  clientAccountId: string;
}

export interface Campaign {
  id: string;
  clientId: string;
  name: string;
  archivedAt: string | null;
}

export interface ContentType {
  id: string;
  key: string;
  label: string;
  order: number;
}

export interface Status {
  id: string;
  key: string;
  label: string;
  color: string;
  order: number;
}

export type AssetType = "image" | "video" | "pdf" | "document" | "other";

export interface PublicationAsset {
  id: string;
  publicationId: string;
  type: AssetType;
  filename: string;
  mimeType: string | null;
  driveFileId: string | null;
  driveFileUrl: string | null;
  thumbnailUrl: string | null;
  fileSize: number | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface Publication {
  id: string;
  calendarId: string;
  clientId: string;
  title: string;
  publicationDate: string;
  publicationTime: string | null;
  campaignId: string | null;
  contentTypeId: string;
  statusId: string;
  copy: string;
  cta: string | null;
  externalUrl: string | null;
  internalNotes: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  destinations: PublicationDestination[];
  assets: PublicationAsset[];
}
