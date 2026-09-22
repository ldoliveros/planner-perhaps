import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getPublicationById } from "@/lib/supabase/queries";

/**
 * Link universal de "Compartir" (mismo formato para todos los roles: /p/<publicationId>). No renderiza ni expone
 * contenido de la publicación — solo resuelve a dónde corresponde abrirla según quién esté logueado y redirige
 * ahí con `?publication=<id>`, que CalendarScreen ya sabe abrir en el drawer (ver calendar-screen.tsx) y limpiar
 * de la URL al cerrarlo. Reutiliza `getPublicationById` (ya scopeado por RLS: publications_select_own para
 * Client, publications_manage/can_manage_client para Super Admin y Account Manager) — no duplica esa lógica.
 *
 * Sin sesión: a /login con `next=/p/<id>` (sanitizeNext lo admite sin gatear por rol, ya que esta misma ruta
 * vuelve a resolver el destino correcto después de ingresar). Sin acceso o id inexistente: mensaje genérico,
 * sin distinguir un caso del otro (evita filtrar si la publicación existe para otro cliente).
 */
export default async function SharedPublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/p/${id}`)}`);
  }

  const [profile, publication] = await Promise.all([getCurrentProfile(), getPublicationById(id)]);

  if (publication) {
    if (profile?.role === "client") {
      redirect(`/client/planner?publication=${publication.id}`);
    }
    if (profile?.role === "super_admin" || profile?.role === "account_manager") {
      redirect(`/admin/clients/${publication.clientId}/planner?publication=${publication.id}`);
    }
  }

  // Sin publicación (no existe o RLS no dio acceso) o sin perfil de rol reconocido: al Planner de su rol, que
  // ya sabe mostrar el estado correcto (incluida la pantalla de "sin permisos" si corresponde).
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="text-sm text-muted-foreground">
        No pudimos abrir esta publicación. Puede que se haya eliminado o que no tengas acceso a ella.
      </p>
      <Link
        href={profile?.role === "client" ? "/client/planner" : "/admin"}
        className="text-sm font-medium text-foreground underline underline-offset-4"
      >
        Ir a mi Planner
      </Link>
    </div>
  );
}
