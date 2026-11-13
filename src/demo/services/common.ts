import { getDemoViewer, viewerName } from "../app/session";
import { db } from "../store/db";
import { isoDateTime, today } from "../store/ids";

export const NEXT_STAGE = "Disponível na próxima etapa da demonstração.";

export function notYet(): never {
  throw new Error(NEXT_STAGE);
}

export function requireAdmin(ErrorType: new (message: string) => Error, message = "Somente administradores podem fazer esta alteração.") {
  if (getDemoViewer().role !== "administrador") throw new ErrorType(message);
}

export function requireSeller(ErrorType: new (message: string) => Error) {
  const role = getDemoViewer().role;
  if (role !== "administrador" && role !== "comercial") throw new ErrorType("Seu perfil não tem permissão para esta operação.");
}

export function logCatalogChange(what: string) {
  db.write((tables) => {
    tables.catalog.changeLog.unshift({ at: isoDateTime(today()), who: viewerName(), what });
    tables.catalog.changeLog.splice(200);
  });
}

export function nowIso() {
  return isoDateTime(today());
}

export function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
