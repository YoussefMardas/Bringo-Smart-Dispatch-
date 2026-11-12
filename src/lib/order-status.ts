/**
 * Règle métier des statuts de commande (source Redash : « Status » et « Cancel_reason » ; « Status Acceptation » si présent).
 *
 *  OK         → acceptée dans les délais      : dispatchée et comptée
 *  LATE       → acceptée en retard            : dispatchée et comptée
 *  CANCELLED  → annulée                       : exclue du dispatch et des commandes acceptées
 *  OTHER      → statut d'acceptation renseigné mais inconnu : ni dispatchée ni comptée comme acceptée
 *
 * Le statut est recalculé à chaque import : une commande qui change de statut dans le fichier
 * change de catégorie (donc de compteurs) automatiquement.
 */
export type OrderStatus = "OK" | "LATE" | "CANCELLED" | "OTHER";

export const DISPATCHABLE: OrderStatus[] = ["OK", "LATE"];

export const isDispatchable = (s: string): boolean => s === "OK" || s === "LATE";

const clean = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function fromText(t: string): OrderStatus | null {
  if (!t) return null;
  if (/annul|cancel/.test(t)) return "CANCELLED";
  if (/retard|late|delay/.test(t)) return "LATE";
  if (t === "ok" || /^accept|^valide|^confirm/.test(t)) return "OK";
  return null;
}

export function classifyStatus(raw: Record<string, unknown> | null | undefined): OrderStatus {
  const acceptation = clean(raw?.["Status Acceptation"]);
  const general = clean(raw?.["Status"]);
  const reason = clean(raw?.["Cancel_reason"]);
  // Annulation : statut « cancelled » (source Redash) ou signalée dans l'une des colonnes ; un motif d'annulation
  // renseigné sur une commande non livrée vaut aussi annulation.
  if (fromText(acceptation) === "CANCELLED" || fromText(general) === "CANCELLED") return "CANCELLED";
  if (reason && general !== "fulfilled") return "CANCELLED";
  // Statut d'acceptation explicite (anciens fichiers) : OK / Retard ; valeur inconnue → ni dispatchée ni acceptée.
  if (acceptation) return fromText(acceptation) ?? "OTHER";
  // Source Redash : pas de colonne d'acceptation ; toute commande non annulée (new, fulfilled…) est à dispatcher.
  return "OK";
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  OK: "OK",
  LATE: "Retard",
  CANCELLED: "Annulée",
  OTHER: "Autre statut",
};

/** Filtre Prisma des commandes à dispatcher : statut OK ou Retard, au moins un article. */
export const DISPATCH_WHERE = { status: { in: DISPATCHABLE as string[] }, articles: { gte: 1 } } as const;
