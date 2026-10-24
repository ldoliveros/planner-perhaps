/**
 * Link a Trello de una publicación (v1.6). Mismo criterio que el CHECK `publications_trello_url_check`:
 * https, dominio trello.com (con o sin www) y una ruta; hasta 2048 caracteres. Lo usan el formulario (para
 * ofrecer "Abrir en Trello" solo con un link válido) y savePublication (para rechazar antes de llegar a la base).
 */
const TRELLO_URL_PATTERN = /^https:\/\/(www\.)?trello\.com\//i;
const MAX_TRELLO_URL_LENGTH = 2048;

export const TRELLO_URL_ERROR = "El link a Trello debe ser una dirección https://trello.com/… (por ejemplo, la de una tarjeta).";

export function isValidTrelloUrl(value: string): boolean {
  return value.length <= MAX_TRELLO_URL_LENGTH && TRELLO_URL_PATTERN.test(value);
}
