/**
 * Créneaux et dates. Les créneaux viennent désormais du fichier importé (colonne Creneau) :
 * il n'y a plus de liste fixe, seulement des options disponibles par magasin.
 */

const TZ = "Africa/Casablanca";

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Date du jour (AAAA-MM-JJ) à Casablanca. */
export function todayString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Valeur à stocker dans une colonne `DATE` Prisma. */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDateFr(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(toDbDate(date));
}

/** « 10:00-12:00 » → « 10:00 – 12:00 » ; un texte libre reste inchangé. */
export function formatSlot(slot: string): string {
  return /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(slot) ? slot.replace("-", " – ") : slot;
}

export interface SlotOption {
  date: string;
  slot: string;
  orders: number;
}

/** Tri des créneaux : par heure de début (« 08:00-10:00 »), les libellés libres à la fin. */
export function compareSlots(a: string, b: string): number {
  const ta = /^\d{2}:\d{2}/.test(a);
  const tb = /^\d{2}:\d{2}/.test(b);
  if (ta !== tb) return ta ? -1 : 1;
  return a.localeCompare(b, "fr");
}

/**
 * Options date × créneau d'un magasin. Le catalogue des créneaux du magasin est l'ensemble de ceux
 * rencontrés dans ses données (tous jours confondus, sans liste codée en dur) : chaque jour affiche
 * donc tous les créneaux du magasin, avec 0 commande tant qu'aucune n'est remontée. Aujourd'hui est toujours proposé.
 */
export function buildSlotOptions(
  rows: { date: string; slot: string; orders: number }[],
  today: string,
  maxDates = 45,
): SlotOption[] {
  if (rows.length === 0) return [];
  const catalog = [...new Set(rows.map((r) => r.slot))].sort(compareSlots);
  const counts = new Map(rows.map((r) => [`${r.date}|${r.slot}`, r.orders]));
  const dates = [...new Set([...rows.map((r) => r.date), today])].sort().reverse();
  const kept = dates.slice(0, maxDates);
  if (!kept.includes(today)) kept.push(today);
  return kept.flatMap((date) => catalog.map((slot) => ({ date, slot, orders: counts.get(`${date}|${slot}`) ?? 0 })));
}

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Choisit date + créneau (?date=&slot=). Une sélection explicite est toujours respectée, même sans commande.
 * Par défaut : aujourd'hui s'il a des commandes, sinon le jour le plus récent qui en a ; premier créneau garni.
 */
export function resolveSelection(
  options: SlotOption[],
  params: RawParams,
  today: string = todayString(),
): { date: string; slot: string | null } {
  const date = first(params.date);
  const slot = first(params.slot);
  if (date && slot && options.some((o) => o.date === date && o.slot === slot)) return { date, slot };
  const pick = (d: string) => options.find((o) => o.date === d && o.orders > 0) ?? options.find((o) => o.date === d);
  if (date) {
    const sameDay = pick(date);
    if (sameDay) return { date, slot: sameDay.slot };
  }
  const best =
    options.find((o) => o.date === today && o.orders > 0) ?? options.find((o) => o.orders > 0) ?? options[0];
  if (best) return { date: best.date, slot: pick(best.date)!.slot };
  return { date: today, slot: null };
}
