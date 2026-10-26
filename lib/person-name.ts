/**
 * Nombre + Apellido → `profiles.full_name` (v1.6). La base guarda un solo campo: se concatenan con un espacio solo
 * si hay Apellido. Para editar un usuario existente, el `full_name` completo va en Nombre y Apellido queda vacío
 * (no se intenta separar nombres y apellidos automáticamente).
 */
export function joinPersonName(firstName: string, lastName: string): string {
  const first = firstName.trim().replace(/\s+/g, " ");
  const last = lastName.trim().replace(/\s+/g, " ");
  // Sin Nombre no hay full_name válido (el Nombre es obligatorio): "" hace fallar la validación del caller.
  if (!first) return "";
  return last ? `${first} ${last}` : first;
}

export const FIRST_NAME_REQUIRED_ERROR = "Completá el nombre.";
