"use client";

import { createContext, useContext, useMemo } from "react";
import type { AccountType, Calendar, Campaign, ClientAccount, ContentType, Platform, Status } from "@/types";

interface LookupsValue {
  platforms: Platform[];
  accountTypes: AccountType[];
  contentTypes: ContentType[];
  statuses: Status[];
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
  getPlatform: (id: string) => Platform | undefined;
  getAccountType: (id: string) => AccountType | undefined;
  getContentType: (id: string) => ContentType | undefined;
  getStatus: (id: string) => Status | undefined;
  getCalendar: (id: string) => Calendar | undefined;
  getClientAccount: (id: string) => ClientAccount | undefined;
  getCampaign: (id: string) => Campaign | undefined;
}

const LookupsContext = createContext<LookupsValue | null>(null);

interface LookupsProviderProps {
  platforms: Platform[];
  accountTypes: AccountType[];
  contentTypes: ContentType[];
  statuses: Status[];
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
  children: React.ReactNode;
}

export function LookupsProvider({
  platforms,
  accountTypes,
  contentTypes,
  statuses,
  calendars,
  clientAccounts,
  campaigns,
  children,
}: LookupsProviderProps) {
  const value = useMemo<LookupsValue>(() => {
    const platformMap = new Map(platforms.map((p) => [p.id, p]));
    const accountTypeMap = new Map(accountTypes.map((a) => [a.id, a]));
    const contentTypeMap = new Map(contentTypes.map((c) => [c.id, c]));
    const statusMap = new Map(statuses.map((s) => [s.id, s]));
    const calendarMap = new Map(calendars.map((c) => [c.id, c]));
    const clientAccountMap = new Map(clientAccounts.map((a) => [a.id, a]));
    const campaignMap = new Map(campaigns.map((c) => [c.id, c]));
    return {
      platforms,
      accountTypes,
      contentTypes,
      statuses,
      calendars,
      clientAccounts,
      campaigns,
      getPlatform: (id) => platformMap.get(id),
      getAccountType: (id) => accountTypeMap.get(id),
      getContentType: (id) => contentTypeMap.get(id),
      getStatus: (id) => statusMap.get(id),
      getCalendar: (id) => calendarMap.get(id),
      getClientAccount: (id) => clientAccountMap.get(id),
      getCampaign: (id) => campaignMap.get(id),
    };
  }, [platforms, accountTypes, contentTypes, statuses, calendars, clientAccounts, campaigns]);

  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}

export function useLookups(): LookupsValue {
  const ctx = useContext(LookupsContext);
  if (!ctx) {
    throw new Error("useLookups debe usarse dentro de un LookupsProvider");
  }
  return ctx;
}
