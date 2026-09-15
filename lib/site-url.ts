import { headers } from "next/headers";

/**
 * Fuente unica de la URL publica del sitio para redirects de Auth
 * (Magic Link, invitaciones, reset password, callback). En produccion
 * usa SITE_URL: en Netlify el header Origin que llega a la Server Action
 * puede resolver al hostname interno (*.netlify.app) en vez del dominio
 * publico. En local, sin SITE_URL configurada, cae al origin de la
 * request para seguir funcionando contra localhost sin setup extra.
 */
export async function getSiteURL(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const origin = (await headers()).get("origin");
  return origin ?? "http://localhost:3000";
}
