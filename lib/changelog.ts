import { APP_VERSION } from "@/lib/version";
import type { UserRole } from "@/types";

export interface ChangelogEntry {
  text: string;
  /** Roles que pueden ver esta novedad puntual. */
  roles: UserRole[];
}

export interface ChangelogRelease {
  version: string;
  date: string; // yyyy-MM-dd
  entries: ChangelogEntry[];
}

/**
 * Historial de versiones, mas reciente primero. Agregar una version nueva es
 * solamente sumar un elemento acá — /changelog y el banner de novedades no
 * requieren cambios.
 */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "1.3.2",
    date: "2026-09-21",
    entries: [
      {
        text: "Mejoramos el acceso de nuevos usuarios: al recibir una invitación, ahora podés crear tu contraseña y acceder directamente a Perhaps Planner.",
        roles: ["super_admin", "account_manager", "client"],
      },
    ],
  },
  {
    version: "1.3.1",
    date: "2026-09-21",
    entries: [
      {
        text: "Arrastrar y soltar en la vista Mes: mové una publicación a otro día directamente desde el calendario mensual, conservando su horario (en computadora).",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Un solo acceso para todos: ahora todos ingresan desde la misma pantalla, con email y contraseña o con un enlace por email.",
        roles: ["super_admin", "account_manager", "client"],
      },
    ],
  },
  {
    version: "1.3",
    date: "2026-09-21",
    entries: [
      {
        text: "Planner optimizado para mobile: ahora podés trabajar cómodamente desde el teléfono.",
        roles: ["super_admin", "account_manager", "client"],
      },
      {
        text: "Semana, Mes y Lista adaptados al teléfono: cada vista se reorganiza para que el calendario sea claro y fácil de recorrer en pantallas chicas.",
        roles: ["super_admin", "account_manager", "client"],
      },
      {
        text: "Filtros en mobile: filtrá por calendario, canal, estado y más desde un panel pensado para el teléfono.",
        roles: ["super_admin", "account_manager", "client"],
      },
      {
        text: "Publicaciones desde el celular: ver, editar, duplicar y cambiar la fecha de una publicación sin necesidad de una computadora.",
        roles: ["super_admin", "account_manager"],
      },
      {
        // Variante de consulta: el Client User solo ve el Planner (read-only).
        text: "Publicaciones desde el celular: abrí y revisá cada publicación con todos sus detalles desde el teléfono.",
        roles: ["client"],
      },
      {
        text: "Administrador adaptado al teléfono: clientes, calendarios, cuentas, equipo y publicaciones se ven en tarjetas fáciles de usar, y los formularios y paneles se ajustan a la pantalla.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Ingreso más flexible: ahora podés entrar con tu email y contraseña, o pedir un enlace por email si preferís.",
        roles: ["client"],
      },
      {
        text: "Mi perfil: sumá tu nombre y tu foto, y creá o cambiá tu contraseña cuando quieras.",
        roles: ["client"],
      },
      {
        text: "Mejoras generales de experiencia y seguridad: ver u ocultar la contraseña al ingresarla, un aviso de novedades más simple y otros ajustes para que todo funcione de forma más clara y segura.",
        roles: ["super_admin", "account_manager", "client"],
      },
    ],
  },
  {
    version: "1.2.1",
    date: "2026-09-20",
    entries: [
      {
        text: "Mejoramos distintos detalles del Planner para hacer más simple y consistente la gestión diaria de contenidos.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Filtros más relevantes: los filtros ahora muestran únicamente las opciones que realmente están en uso en el período y calendarios seleccionados, reduciendo opciones innecesarias.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Estados más simples: simplificamos el flujo editorial a cuatro estados: Borrador, En revisión, Aprobado y Publicado.",
        roles: ["super_admin", "account_manager", "client"],
      },
      {
        // Variante de consulta para el Client User (Planner read-only).
        text: "Filtros más relevantes: los filtros ahora muestran únicamente las opciones que realmente están en uso en el período y calendarios seleccionados.",
        roles: ["client"],
      },
      {
        text: "Cuentas y canales más claros: el handle pasa a ser el identificador principal de cada cuenta o canal, para identificarlos más rápido en publicaciones, filtros y calendarios.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Navegación más directa: mejoramos accesos y acciones en Clientes y Calendarios para llegar más rápido al Planner.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Interfaz más consistente: unificamos la visualización de estados, acciones y tablas en distintas secciones del administrador.",
        roles: ["super_admin", "account_manager"],
      },
      {
        // Variante de consulta: el Client User solo ve el Planner.
        text: "Interfaz más consistente: mejoramos la visualización de estados y algunos detalles del Planner para que la información sea más clara.",
        roles: ["client"],
      },
      {
        text: "Notificaciones renovadas: actualizamos el diseño de las notificaciones para que los mensajes de éxito, error e información sean más claros y fáciles de identificar.",
        roles: ["super_admin", "account_manager"],
      },
    ],
  },
  {
    version: "1.2",
    date: "2026-09-18",
    entries: [
      {
        text: "Una experiencia más ágil para planificar y gestionar contenidos.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Mover publicaciones más fácil: ahora podés arrastrar publicaciones de un día a otro directamente desde la vista semanal.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Acciones rápidas: editá, duplicá, cambiá el estado o eliminá una publicación directamente desde el calendario.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Mejor edición de copies: sumamos emojis, negritas, listas, contador de caracteres y copia rápida al portapapeles.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Campañas: ahora podés organizar y filtrar publicaciones utilizando campañas reutilizables.",
        roles: ["super_admin", "account_manager"],
      },
      {
        // Variante de consulta: el Client User solo filtra (Planner read-only).
        text: "Campañas: ahora podés filtrar las publicaciones por campaña para encontrar el contenido más fácilmente.",
        roles: ["client"],
      },
      {
        text: "Exportar calendario: descargá en CSV el calendario que estás viendo, respetando el período, los calendarios seleccionados y los filtros activos.",
        roles: ["super_admin", "account_manager"],
      },
      {
        text: "Mejor gestión de accesos: ahora podés identificar usuarios activos, invitados o desactivados y reenviar invitaciones pendientes.",
        roles: ["super_admin"],
      },
      {
        text: "Navegación más cómoda: el menú lateral ahora puede expandirse al pasar el mouse y mantenerse fijo si preferís trabajar con la navegación abierta.",
        roles: ["super_admin", "account_manager"],
      },
      {
        // El Client User también recibe estos avisos (copiar copy, perfil y contraseña).
        text: "Notificaciones más claras: renovamos las notificaciones para distinguir rápidamente acciones exitosas, errores e información.",
        roles: ["super_admin", "account_manager", "client"],
      },
    ],
  },
];

/** Historial completo visible para un rol (para /changelog). */
export function getChangelogForRole(role: UserRole): ChangelogRelease[] {
  return CHANGELOG.map((release) => ({
    ...release,
    entries: release.entries.filter((entry) => entry.roles.includes(role)),
  })).filter((release) => release.entries.length > 0);
}

/**
 * Novedades de la version ACTUAL (APP_VERSION) visibles para un rol —
 * exclusivamente para el banner "Nuevas actualizaciones". Nunca versiones
 * anteriores: un usuario con last_seen_version=null solo debe ver esto,
 * jamás el historico retroactivo completo.
 */
export function getCurrentReleaseForRole(role: UserRole): ChangelogRelease | null {
  return getChangelogForRole(role).find((release) => release.version === APP_VERSION) ?? null;
}
