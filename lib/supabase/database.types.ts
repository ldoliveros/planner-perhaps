export type ClientRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  color: string;
  active: boolean;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  created_at: string;
  updated_at: string;
};
export type ClientInsert = {
  id?: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  color?: string;
  active?: boolean;
  drive_folder_id?: string | null;
  drive_folder_url?: string | null;
};
export type ClientUpdate = Partial<ClientInsert>;

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: "super_admin" | "account_manager" | "client";
  client_id: string | null;
  created_at: string;
  // v1.2 Bloque A — supabase/migrations/20260917000001_last_seen_version.sql
  // (columna todavia no aplicada contra la base compartida: ver informe de Bloque A).
  last_seen_version: string | null;
};
export type ProfileInsert = Omit<ProfileRow, "created_at">;
export type ProfileUpdate = Partial<ProfileInsert>;

export type UserClientAssignmentRow = {
  id: string;
  user_id: string;
  client_id: string;
  created_at: string;
  created_by: string | null;
};
export type UserClientAssignmentInsert = {
  id?: string;
  user_id: string;
  client_id: string;
  created_by?: string | null;
};
export type UserClientAssignmentUpdate = Partial<UserClientAssignmentInsert>;

export type CalendarRow = {
  id: string;
  client_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  created_at: string;
  updated_at: string;
};
export type CalendarInsert = {
  id?: string;
  client_id: string;
  name: string;
  slug: string;
  description?: string | null;
  status?: "draft" | "active" | "archived";
  drive_folder_id?: string | null;
  drive_folder_url?: string | null;
};
export type CalendarUpdate = Partial<CalendarInsert>;

export type PlatformRow = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string;
  requires_account_type: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
};
export type PlatformInsert = {
  id?: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string;
  requires_account_type?: boolean;
  sort_order?: number;
  active?: boolean;
};
export type PlatformUpdate = Partial<PlatformInsert>;

export type AccountTypeRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};
export type AccountTypeInsert = {
  id?: string;
  name: string;
  slug: string;
  sort_order?: number;
};
export type AccountTypeUpdate = Partial<AccountTypeInsert>;

export type ContentTypeRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
};
export type ContentTypeInsert = {
  id?: string;
  key: string;
  label: string;
  sort_order?: number;
};
export type ContentTypeUpdate = Partial<ContentTypeInsert>;

export type StatusRow = {
  id: string;
  key: string;
  label: string;
  color: string;
  sort_order: number;
  is_default: boolean;
};
export type StatusInsert = {
  id?: string;
  key: string;
  label: string;
  color: string;
  sort_order?: number;
  is_default?: boolean;
};
export type StatusUpdate = Partial<StatusInsert>;

export type PublicationRow = {
  id: string;
  calendar_id: string;
  client_id: string;
  title: string;
  publication_date: string;
  publication_time: string | null;
  // Respaldo histórico de transición — ver supabase/migrations/20260918000001_campaigns.sql.
  // La fuente de verdad funcional pasó a ser campaign_id; no editar desde la app.
  campaign: string | null;
  campaign_id: string | null;
  content_type_id: string;
  status_id: string;
  copy: string;
  cta: string | null;
  external_url: string | null;
  internal_notes: string | null;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  created_at: string;
  updated_at: string;
};
export type PublicationInsert = {
  id?: string;
  calendar_id: string;
  title: string;
  publication_date: string;
  publication_time?: string | null;
  campaign_id?: string | null;
  content_type_id: string;
  status_id: string;
  copy?: string;
  cta?: string | null;
  external_url?: string | null;
  internal_notes?: string | null;
  drive_folder_id?: string | null;
  drive_folder_url?: string | null;
};
export type PublicationUpdate = Partial<PublicationInsert>;

export type CampaignRow = {
  id: string;
  client_id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
};
export type CampaignInsert = {
  id?: string;
  client_id: string;
  name: string;
  archived_at?: string | null;
  created_by?: string | null;
};
export type CampaignUpdate = Partial<CampaignInsert>;

export type ClientAccountRow = {
  id: string;
  client_id: string;
  platform_id: string;
  name: string | null;
  handle: string;
  url: string | null;
  account_type_id: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
export type ClientAccountInsert = {
  id?: string;
  client_id: string;
  platform_id: string;
  name?: string | null;
  handle: string;
  url?: string | null;
  account_type_id?: string | null;
  active?: boolean;
  sort_order?: number;
};
export type ClientAccountUpdate = Partial<ClientAccountInsert>;

export type PublicationDestinationRow = {
  id: string;
  publication_id: string;
  client_account_id: string;
  created_at: string;
};
export type PublicationDestinationInsert = {
  id?: string;
  publication_id: string;
  client_account_id: string;
};
export type PublicationDestinationUpdate = Partial<PublicationDestinationInsert>;

export type PublicationAssetRow = {
  id: string;
  publication_id: string;
  type: "image" | "video" | "pdf" | "document" | "other";
  filename: string;
  mime_type: string | null;
  drive_file_id: string | null;
  drive_file_url: string | null;
  thumbnail_url: string | null;
  file_size: number | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};
export type PublicationAssetInsert = {
  id?: string;
  publication_id: string;
  type: "image" | "video" | "pdf" | "document" | "other";
  filename: string;
  mime_type?: string | null;
  drive_file_id?: string | null;
  drive_file_url?: string | null;
  thumbnail_url?: string | null;
  file_size?: number | null;
  sort_order?: number;
  is_primary?: boolean;
};
export type PublicationAssetUpdate = Partial<PublicationAssetInsert>;

export type Database = {
  public: {
    Tables: {
      clients: { Row: ClientRow; Insert: ClientInsert; Update: ClientUpdate; Relationships: [] };
      profiles: { Row: ProfileRow; Insert: ProfileInsert; Update: ProfileUpdate; Relationships: [] };
      calendars: { Row: CalendarRow; Insert: CalendarInsert; Update: CalendarUpdate; Relationships: [] };
      platforms: { Row: PlatformRow; Insert: PlatformInsert; Update: PlatformUpdate; Relationships: [] };
      account_types: {
        Row: AccountTypeRow;
        Insert: AccountTypeInsert;
        Update: AccountTypeUpdate;
        Relationships: [];
      };
      content_types: {
        Row: ContentTypeRow;
        Insert: ContentTypeInsert;
        Update: ContentTypeUpdate;
        Relationships: [];
      };
      statuses: { Row: StatusRow; Insert: StatusInsert; Update: StatusUpdate; Relationships: [] };
      publications: {
        Row: PublicationRow;
        Insert: PublicationInsert;
        Update: PublicationUpdate;
        Relationships: [];
      };
      client_accounts: {
        Row: ClientAccountRow;
        Insert: ClientAccountInsert;
        Update: ClientAccountUpdate;
        Relationships: [];
      };
      publication_destinations: {
        Row: PublicationDestinationRow;
        Insert: PublicationDestinationInsert;
        Update: PublicationDestinationUpdate;
        Relationships: [];
      };
      publication_assets: {
        Row: PublicationAssetRow;
        Insert: PublicationAssetInsert;
        Update: PublicationAssetUpdate;
        Relationships: [];
      };
      user_client_assignments: {
        Row: UserClientAssignmentRow;
        Insert: UserClientAssignmentInsert;
        Update: UserClientAssignmentUpdate;
        Relationships: [];
      };
      campaigns: { Row: CampaignRow; Insert: CampaignInsert; Update: CampaignUpdate; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
