import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // Solo rutas relativas propias — evita un open redirect vía ?next=.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const siteURL = await getSiteURL();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${siteURL}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${siteURL}/login?error=1`);
}
