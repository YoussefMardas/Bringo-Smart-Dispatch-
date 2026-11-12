import { classifyStatus, type OrderStatus } from "@/lib/order-status";
/**
 * Lecture du fichier source .xlsm (46 colonnes). Fonctions pures, sans dépendance :
 * le fichier est lu par `read-excel-file` dans le navigateur, ce module transforme les lignes.
 */

/** Colonnes du fichier source, dans l'ordre attendu. */
export const XLSM_COLUMNS = [
  "Order Number",
  "Store",
  "Creneau",
  "Fraudeur",
  "Number Of Products",
  "Order Time",
  "Status Acceptation",
  "Acceptation Time",
  "Status Préparation",
  "Heure fin préparation",
  "Status Affectation",
  "Status Chargement",
  "Chargement Time",
  "Status LastMile",
  "Heure de cloture",
  "Total Amount Paid",
  "Picker Name",
  "Shopper Name",
  "Order Date",
  "Status",
  "Initial Amount",
  "Delivery Type",
  "Organization",
  "Custom Delivery Type",
  "BU",
  "LatLong",
  "Number Of Final Products",
  "Date d'acceptation prep",
  "Order Preparation End",
  "Chargement date",
  "Day Of Delivery",
  "Date de cloture",
  "checkout_completed_at",
  "Date de cloture act",
  "Fin De Creneau",
  "Debut De Creneau",
  "Durée de prep initiale",
  "Durée de livraison théorique",
  "Durée de préparation",
  "Durée de livraison",
  "Durée de prep théorique",
  "Etat Shopper",
  "Etat Picker",
  "Date d'assignation",
  "Maintenant",
  "Maintenant2",
] as const;

export type RawValue = string | number | boolean | null;

export interface ImportedOrder {
  orderNumber: string;
  store: string;
  /** Créneau normalisé (« 10:00-12:00 ») ou texte d'origine s'il n'est pas reconnu. */
  slot: string;
  /** Jour de livraison / de commande (AAAA-MM-JJ). */
  date: string;
  /** Number Of Products. */
  products: number;
  /** Toutes les colonnes du fichier, par nom, conservées pour les traitements internes. */
  raw: Record<string, RawValue>;
  /** Statut métier déduit de « Status Acceptation » (voir order-status.ts). */
  status: OrderStatus;
}

export interface ParseResult {
  orders: ImportedOrder[];
  errors: string[];
  /** Lignes ignorées car le magasin n'est pas un Hyper. */
  skippedNonHyper: number;
  /** true si les en-têtes ont été reconnus, false si la lecture est positionnelle. */
  headerDetected: boolean;
  duplicates: number;
}

export const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const NORMALIZED = XLSM_COLUMNS.map(norm);

/** L'import ne conserve que les Hyper magasins (nom de magasin commençant par « Hyper », ex. « Hyper Dar Bouazza »). */
export function isHyperStore(name: string): boolean {
  return /(^| )hyper/.test(norm(name));
}
const COL = {
  order: 0,
  store: 1,
  creneau: 2,
  products: 4,
} as const;

/** Ordre de priorité pour déterminer le jour de l'opération. */
const DATE_COLUMNS = ["Day Of Delivery", "Order Date", "Debut De Creneau", "Order Time"] as const;

// ---------------------------------------------------------------------------
// Valeurs
// ---------------------------------------------------------------------------

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
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`; // jour/mois/année
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
// Lecture
// ---------------------------------------------------------------------------

/** Cherche la ligne d'en-tête (parmi les 10 premières) : Order Number + Store + Creneau + Number Of Products. */
function findHeader(rows: unknown[][]): { row: number; index: Map<string, number> } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = rows[r].map(norm);
    const need = [COL.order, COL.store, COL.creneau, COL.products].map((i) => NORMALIZED[i]);
    if (need.every((n) => cells.includes(n))) {
      const index = new Map<string, number>();
      cells.forEach((c, i) => {
        if (c && !index.has(c)) index.set(c, i);
      });
      return { row: r, index };
    }
  }
  return null;
}

export function parseXlsmRows(rows: unknown[][]): ParseResult {
  const errors: string[] = [];
  const nonEmpty = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((c) => String(c ?? "").trim() !== ""));
  if (nonEmpty.length === 0) {
    return { orders: [], errors: ["Le fichier est vide."], skippedNonHyper: 0, headerDetected: false, duplicates: 0 };
  }

  const header = findHeader(rows);
  // Positionnel : colonne i = XLSM_COLUMNS[i]. Par en-tête : colonne retrouvée par son nom.
  const colOf = (name: string, position: number) => (header ? header.index.get(norm(name)) ?? -1 : position);

  const refs = {
    order: colOf("Order Number", COL.order),
    store: colOf("Store", COL.store),
    creneau: colOf("Creneau", COL.creneau),
    products: colOf("Number Of Products", COL.products),
  };

  // Lecture positionnelle : on saute une éventuelle ligne de titres (colonne « produits » non numérique).
  let firstData = header ? header.row + 1 : 0;
  if (!header) {
    const first = rows[nonEmpty[0].i];
    const p = first[refs.products];
    if (p !== undefined && p !== null && p !== "" && !Number.isFinite(Number(p))) {
      firstData = nonEmpty[0].i + 1;
      errors.push("En-têtes non reconnus : lecture par position des colonnes (ligne de titres ignorée).");
    } else {
      errors.push("En-têtes non reconnus : lecture par position des colonnes.");
    }
  }

  // Noms de colonnes → index, pour conserver toutes les colonnes dans `raw`.
  const rawColumns: { name: string; index: number }[] = header
    ? [...header.index.entries()].map(([n, index]) => ({
        name: XLSM_COLUMNS[NORMALIZED.indexOf(n)] ?? String(rows[header.row][index]).trim(),
        index,
      }))
    : XLSM_COLUMNS.map((name, index) => ({ name, index }));
  const colIdx = (name: string) => rawColumns.find((c) => c.name === name)?.index ?? -1;
  const debutCol = colIdx("Debut De Creneau");
  const finCol = colIdx("Fin De Creneau");
  const finalProductsCol = colIdx("Number Of Final Products");
  const dateCols = DATE_COLUMNS.map((name) => rawColumns.find((c) => c.name === name)?.index ?? -1);

  const byKey = new Map<string, ImportedOrder>();
  let duplicates = 0;
  let skippedNonHyper = 0;

  for (let i = firstData; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const line = i + 1;

    const orderNumber = String(row[refs.order] ?? "").trim();
    const store = String(row[refs.store] ?? "").trim().replace(/\s+/g, " ");
    const products = Number(String(row[refs.products] ?? "").replace(",", ".").trim());
    if (!orderNumber || !store) {
      errors.push(`Ligne ${line} ignorée : Order Number ou Store manquant.`);
      continue;
    }
    if (!isHyperStore(store)) {
      skippedNonHyper++;
      continue;
    }
    // Repli sur « Number Of Final Products » ; une commande annulée peut avoir 0 article (elle reste importée et comptée).
    let articles = products;
    if (!Number.isInteger(articles) || articles < 1) {
      const alt = finalProductsCol >= 0 ? Number(String(row[finalProductsCol] ?? "").replace(",", ".").trim()) : NaN;
      if (Number.isInteger(alt) && alt >= 1) articles = alt;
    }

    let date: string | null = null;
    for (const c of dateCols) {
      if (c >= 0 && (date = toIsoDate(row[c]))) break;
    }
    if (!date) {
      errors.push(`Ligne ${line} ignorée : aucune date exploitable (Day Of Delivery / Order Date) pour « ${orderNumber} ».`);
      continue;
    }

    const raw: Record<string, RawValue> = {};
    for (const { name, index } of rawColumns) raw[name] = serialize(row[index]);

    const status = classifyStatus(raw);
    if (!Number.isInteger(articles) || articles < 1) {
      if (status !== "CANCELLED") {
        errors.push(`Ligne ${line} ignorée : Number Of Products invalide pour « ${orderNumber} ».`);
        continue;
      }
      articles = 0;
    }

    const order: ImportedOrder = {
      orderNumber,
      store,
      slot: slotFromRow(row[refs.creneau], debutCol >= 0 ? row[debutCol] : null, finCol >= 0 ? row[finCol] : null),
      date,
      products: articles,
      raw,
      status,
    };
    const key = `${norm(store)}|${orderNumber}`;
    if (byKey.has(key)) duplicates++;
    byKey.set(key, order); // en cas de doublon, la dernière ligne l'emporte
  }

  if (skippedNonHyper > 0) {
    errors.unshift(`${skippedNonHyper} ligne(s) ignorée(s) : magasin non Hyper (import limité aux Hyper magasins).`);
  }
  if (duplicates > 0) errors.push(`${duplicates} doublon(s) d'Order Number dans le fichier : dernière ligne conservée.`);
  return { orders: [...byKey.values()], errors, skippedNonHyper, headerDetected: header !== null, duplicates };
}

/** Résumé par magasin pour l'aperçu. */
export function summarizeByStore(orders: ImportedOrder[]): { store: string; orders: number; products: number }[] {
  const map = new Map<string, { store: string; orders: number; products: number }>();
  for (const o of orders) {
    const key = norm(o.store);
    const s = map.get(key) ?? { store: o.store, orders: 0, products: 0 };
    s.orders++;
    s.products += o.products;
    map.set(key, s);
  }
  return [...map.values()].sort((a, b) => a.store.localeCompare(b.store, "fr"));
}
