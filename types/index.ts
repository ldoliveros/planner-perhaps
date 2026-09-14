export type CalendarStatus = "draft" | "active" | "archived";

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
  name: string;
  handle: string | null;
  url: string | null;
  accountTypeId: string | null;
  active: boolean;
  sortOrder: number;
}

export interface PublicationDestination {
  clientAccountId: string;
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
  campaign: string | null;
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
