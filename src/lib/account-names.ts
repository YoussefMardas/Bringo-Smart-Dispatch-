import { norm } from "@/lib/xlsm-import";

export const DEFAULT_EMAIL_DOMAIN = "bringo.local";

/**
 * Adresse e-mail d'un compte magasin : « Hyper Dar Bouazza » → hyper.dar.bouazza@domaine.
 * `taken` contient les adresses déjà utilisées ; un suffixe numérique est ajouté en cas de collision.
 */
export function storeEmail(storeName: string, domain: string, taken: Set<string>): string {
  const local = norm(storeName).replace(/\s+/g, ".").slice(0, 48) || "magasin";
  let email = `${local}@${domain}`;
  for (let n = 2; taken.has(email); n++) email = `${local}.${n}@${domain}`;
  return email;
}
