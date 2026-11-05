import { randomInt } from "node:crypto";

// Sans caractères ambigus (0/O, 1/l/I) pour faciliter la communication orale ou écrite.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Mot de passe temporaire aléatoire (cryptographiquement sûr), ex. « Kp7Rm-Xb4Tn-Hz9Q ». */
export function generatePassword(groups = 3, groupLength = 4): string {
  const group = () => Array.from({ length: groupLength }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return Array.from({ length: groups }, group).join("-");
}
