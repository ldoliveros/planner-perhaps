import type { ClientAccount } from "@/types";

/** Identificador visible principal de una cuenta/canal: su handle (se guarda sin "@"). */
export function accountLabel(account: Pick<ClientAccount, "handle">): string {
  return account.handle;
}

/** Nombre secundario, solo si existe y aporta algo distinto del handle. */
export function accountSecondaryName(account: Pick<ClientAccount, "handle" | "name">): string | null {
  const name = account.name?.trim();
  if (!name || name.toLowerCase() === account.handle.toLowerCase()) return null;
  return name;
}

/**
 * Labels para listas donde conviven cuentas de distintas plataformas o clientes: el mismo handle puede
 * repetirse entre plataformas (ej. Instagram y Facebook). Si dos labels chocan, se agrega la plataforma.
 */
export function accountLabelsWithPlatform(
  accounts: Pick<ClientAccount, "id" | "handle" | "platformId">[],
  platformNameById: Map<string, string>
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const a of accounts) {
    const key = accountLabel(a).toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map(
    accounts.map((a) => {
      const label = accountLabel(a);
      const platform = platformNameById.get(a.platformId);
      return [a.id, (counts.get(label.toLowerCase()) ?? 0) > 1 && platform ? `${label} (${platform})` : label];
    })
  );
}
