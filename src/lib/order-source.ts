import { classifyStatus, type OrderStatus } from "@/lib/order-status";

export type RawValue = string | number | boolean | null;

/** Commande normalisée issue de la source de données. */
export interface ImportedOrder {
  orderNumber: string;
  store: string;
  /** Créneau « 10:00-12:00 » (ou « Sans créneau »). */
  slot: string;
  /** Jour de livraison (AAAA-MM-JJ). */
  date: string;
  /** Number Of Products (0 possible pour une commande annulée). */
  products: number;
  /** Toutes les colonnes de la source, par nom. */
  raw: Record<string, RawValue>;
  status: OrderStatus;
}

export const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** L'import ne conserve que les Hyper magasins (nom de magasin commençant par « Hyper », ex. « Hyper Dar Bouazza »). */
export function isHyperStore(name: string): boolean {
  return /(^| )hyper/.test(norm(name));
}
const pad = (n: number | string) => String(n).padStart(2, "0");

export function serialize(v: unknown): RawValue {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

/** Date (AAAA-MM-JJ) depuis un Date, un numéro de série Excel, « 02/11/2026 » ou « 2026-11-02… ». */
export function toIsoDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`; // jour/mois/année (« 11/11/26 » ou « 11/11/2026 »)
  return null;
}

/** Heure (HH:MM) depuis un Date, une fraction de jour Excel ou un texte (« 10h », « 10:30:00 », « 2026-11-05 10:00 »). */
export function toClock(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    const mins = Math.round((v % 1) * 1440) % 1440;
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  if (typeof v !== "string") return null;
  const m = v.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
  return m ? `${pad(m[1])}:${m[2] ?? "00"}` : null;
}

/**
 * Créneau d'une ligne : colonne « Creneau » si elle contient deux heures ; sinon reconstitué depuis
 * « Debut De Creneau » + « Fin De Creneau » (livraisons du jour / « Maintenant » dont le libellé est vide ou libre).
 */
export function slotFromRow(creneau: unknown, debut: unknown, fin: unknown): string {
  const direct = normalizeCreneau(creneau);
  if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(direct)) return direct;
  const a = toClock(debut);
  const b = toClock(fin);
  if (a && b && a !== b) return `${a}-${b}`;
  return direct;
}

/** « 10h-12h », « 10:00 - 12:00 », « 10:00 à 12:00 » → « 10:00-12:00 ». */
export function normalizeCreneau(v: unknown): string {
  const text = String(v ?? "").trim();
  if (!text) return "Sans créneau";
  const times = [...text.matchAll(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/gi)];
  if (times.length >= 2) {
    const t = (m: RegExpMatchArray) => `${pad(m[1])}:${m[2] ?? "00"}`;
    return `${t(times[0])}-${t(times[1])}`;
  }
  return text.slice(0, 40);
}

// ---------------------------------------------------------------------------
// CSV (export Redash)
// ---------------------------------------------------------------------------

/** Lecteur CSV RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans un champ, BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export interface CsvParseResult {
  orders: ImportedOrder[];
  /** Lignes lues (hors en-tête), tous magasins confondus. */
  totalRows: number;
  skippedNonHyper: number;
  /** Lignes Hyper écartées (donnée manquante ou invalide), avec la raison. */
  errors: string[];
  duplicates: number;
}

const REQUIRED = ["Order Number", "Store", "Day Of Delivery", "Number Of Products"] as const;

/**
 * Transforme le CSV Redash (requête 4441) en commandes Hyper. Les colonnes sont retrouvées par leur nom
 * (l'ordre peut changer) ; un en-tête sans les colonnes indispensables est une erreur explicite.
 * Créneau = Debut De Creneau + Fin De Creneau ; jour = Day Of Delivery (repli Order Date) ; les décimales à virgule sont conservées telles quelles.
 */
export function parseRedashCsv(text: string): CsvParseResult {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("La source est vide.");
  const header = new Map<string, number>();
  table[0].forEach((h, i) => {
    const k = norm(h);
    if (k && !header.has(k)) header.set(k, i);
  });
  const missing = REQUIRED.filter((c) => !header.has(norm(c)));
  if (missing.length) {
    throw new Error(`Colonnes manquantes dans la source : ${missing.join(", ")}. La requête Redash a-t-elle changé ?`);
  }
  const names = table[0].map((h) => h.trim());
  const idx = (c: string) => header.get(norm(c)) ?? -1;
  const col = {
    order: idx("Order Number"),
    store: idx("Store"),
    day: idx("Day Of Delivery"),
    orderDate: idx("Order Date"),
    debut: idx("Debut De Creneau"),
    fin: idx("Fin De Creneau"),
    products: idx("Number Of Products"),
    finalProducts: idx("Number Of Final Products"),
  };
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const errors: string[] = [];
  const byKey = new Map<string, ImportedOrder>();
  let totalRows = 0;
  let skippedNonHyper = 0;
  let duplicates = 0;

  for (let n = 1; n < table.length; n++) {
    const r = table[n];
    totalRows++;
    const orderNumber = cell(r, col.order);
    const store = cell(r, col.store).replace(/\s+/g, " ");
    if (!orderNumber || !store) {
      errors.push(`Ligne ${n + 1} ignorée : Order Number ou Store manquant.`);
      continue;
    }
    if (!isHyperStore(store)) {
      skippedNonHyper++;
      continue;
    }
    const date = toIsoDate(cell(r, col.day)) ?? toIsoDate(cell(r, col.orderDate));
    if (!date) {
      errors.push(`Commande ${orderNumber} (${store}) ignorée : aucune date de livraison exploitable.`);
      continue;
    }
    const raw: Record<string, RawValue> = {};
    names.forEach((name, i) => {
      if (name) raw[name] = serialize(r[i]);
    });
    const status = classifyStatus(raw);

    let products = Number(cell(r, col.products).replace(",", "."));
    if (!Number.isInteger(products) || products < 1) {
      const alt = Number(cell(r, col.finalProducts).replace(",", "."));
      products = Number.isInteger(alt) && alt >= 1 ? alt : products;
    }
    if (!Number.isInteger(products) || products < 1) {
      if (status !== "CANCELLED") {
        errors.push(`Commande ${orderNumber} (${store}) ignorée : Number Of Products invalide.`);
        continue;
      }
      products = 0; // annulée sans article : conservée pour les compteurs
    }

    const key = `${norm(store)}|${orderNumber}`;
    if (byKey.has(key)) duplicates++;
    byKey.set(key, {
      orderNumber,
      store,
      slot: slotFromRow("", cell(r, col.debut), cell(r, col.fin)),
      date,
      products,
      raw,
      status,
    });
  }
  return { orders: [...byKey.values()], totalRows, skippedNonHyper, errors, duplicates };
}
