"use client";

import { createContext, useContext, useMemo } from "react";
import type { AccountType, ContentType, Platform, Status } from "@/types";

interface LookupsValue {
  platforms: Platform[];
  accountTypes: AccountType[];
  contentTypes: ContentType[];
  statuses: Status[];
  getPlatform: (id: string) => Platform | undefined;
  getAccountType: (id: string) => AccountType | undefined;
  getContentType: (id: string) => ContentType | undefined;
  getStatus: (id: string) => Status | undefined;
}

const LookupsContext = createContext<LookupsValue | null>(null);

interface LookupsProviderProps {
  platforms: Platform[];
  accountTypes: AccountType[];
  contentTypes: ContentType[];
  statuses: Status[];
  children: React.ReactNode;
}

export function LookupsProvider({ platforms, accountTypes, contentTypes, statuses, children }: LookupsProviderProps) {
  const value = useMemo<LookupsValue>(() => {
    const platformMap = new Map(platforms.map((p) => [p.id, p]));
    const accountTypeMap = new Map(accountTypes.map((a) => [a.id, a]));
    const contentTypeMap = new Map(contentTypes.map((c) => [c.id, c]));
    const statusMap = new Map(statuses.map((s) => [s.id, s]));
    return {
      platforms,
      accountTypes,
      contentTypes,
      statuses,
      getPlatform: (id) => platformMap.get(id),
      getAccountType: (id) => accountTypeMap.get(id),
      getContentType: (id) => contentTypeMap.get(id),
      getStatus: (id) => statusMap.get(id),
    };
  }, [platforms, accountTypes, contentTypes, statuses]);

  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}

export function useLookups(): LookupsValue {
  const ctx = useContext(LookupsContext);
  if (!ctx) {
    throw new Error("useLookups debe usarse dentro de un LookupsProvider");
  }
  return ctx;
}
