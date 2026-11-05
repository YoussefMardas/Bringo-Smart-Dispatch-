"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isDateString, toDbDate } from "@/lib/slots";
import { isHyperStore, norm, type RawValue } from "@/lib/xlsm-import";
import { ensureStoreAccounts, type CreatedAccount } from "@/lib/accounts";
import { bumpVersion, recordSync } from "@/lib/sync-state";
import { classifyStatus } from "@/lib/order-status";
import { notifyOps } from "@/lib/notifications";

export type ImportResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; error: string };

/** Ligne envoyée par le navigateur (déjà lue et normalisée depuis le .xlsm). */
export interface ImportRow {
  orderNumber: string;
  store: string;
  slot: string;
  date: string;
  products: number;
  raw: Record<string, RawValue>;
}

const MAX_ROWS_PER_CHUNK = 500;
const MAX_PRODUCTS = 10_000;

/** Import et Clear Data : Super Admin et Master Opérations (le fichier couvre tous les magasins). */
async function requireImporter() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN" && user.role !== "OPS_MASTER") {
    throw new Error("Import réservé au Super Admin et au Master Opérations E-commerce.");
  }
  return user;
}

function slugify(name: string): string {
  return (
    norm(name)
      .replace(/\s+/g, "-")
      .toUpperCase()
      .slice(0, 30) || "MAGASIN"
  );
}

/** JSON à clés triées : JSONB ne conserve pas l'ordre des clés, la comparaison doit l'ignorer. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",")}}`;
}

function validateRow(r: ImportRow): string | null {
  if (!r.orderNumber?.trim() || r.orderNumber.length > 80) return `Order Number invalide (« ${r.orderNumber} »).`;
  if (!r.store?.trim() || r.store.length > 120) return `Store invalide pour « ${r.orderNumber} ».`;
  if (!isHyperStore(r.store)) return `Magasin non Hyper refusé : « ${r.store} » (import limité aux Hyper magasins).`;
  if (!r.slot?.trim() || r.slot.length > 40) return `Créneau invalide pour « ${r.orderNumber} ».`;
  if (!isDateString(r.date)) return `Date invalide pour « ${r.orderNumber} ».`;
  if (!Number.isInteger(r.products) || r.products < 0 || r.products > MAX_PRODUCTS) {
    return `Number Of Products invalide pour « ${r.orderNumber} ».`;
  }
  return null;
}

/**
 * Importe un lot de lignes : crée les magasins inconnus (d'après la colonne Store), les
 * créneaux (magasin × jour × Creneau), puis ajoute ou met à jour les commandes
 * (clé : magasin + Order Number). Idempotent : réimporter le même fichier ne crée pas de doublons.
 */
export async function importChunkAction(input: {
  rows: ImportRow[];
}): Promise<ImportResult<{ added: number; updated: number; unchanged: number; skipped: number; problems: string[]; accounts: CreatedAccount[] }>> {
  try {
    await requireImporter();
    if (input.rows.length === 0) return { ok: false, error: "Lot vide." };
    if (input.rows.length > MAX_ROWS_PER_CHUNK) return { ok: false, error: "Lot trop volumineux." };
    // Une ligne invalide est écartée et signalée, elle ne bloque plus le reste du lot (ni les lignes suivantes du fichier).
    const problems: string[] = [];
    const rows = input.rows.filter((r) => {
      const err = validateRow(r);
      if (err) problems.push(err);
      return !err;
    });
    if (rows.length === 0) return { ok: true, added: 0, updated: 0, unchanged: 0, skipped: problems.length, problems: problems.slice(0, 20), accounts: [] };

    // 1) Magasins (nom comparé sans casse, accents ni espaces multiples)
    const allStores = await prisma.store.findMany({ select: { id: true, name: true, code: true } });
    const storeByName = new Map(allStores.map((s) => [norm(s.name), s.id]));
    const usedCodes = new Set(allStores.map((s) => s.code));
    for (const r of rows) {
      const key = norm(r.store);
      if (storeByName.has(key)) continue;
      let code = slugify(r.store);
      for (let n = 2; usedCodes.has(code); n++) code = `${slugify(r.store)}-${n}`;
      usedCodes.add(code);
      try {
        const created = await prisma.store.create({ data: { name: r.store.trim(), code } });
        storeByName.set(key, created.id);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
        const found = await prisma.store.findFirst({ where: { code } });
        if (!found) throw e;
        storeByName.set(key, found.id);
      }
    }

    // 2) Créneaux
    const slotIds = new Map<string, string>();
    for (const r of rows) {
      const storeId = storeByName.get(norm(r.store))!;
      const key = `${storeId}|${r.date}|${r.slot}`;
      if (slotIds.has(key)) continue;
      const slot = await prisma.workSlot.upsert({
        where: { storeId_date_slot: { storeId, date: toDbDate(r.date), slot: r.slot } },
        update: {},
        create: { storeId, date: toDbDate(r.date), slot: r.slot },
        select: { id: true },
      });
      slotIds.set(key, slot.id);
    }

    // 3) Commandes : ajout / mise à jour
    const byStore = new Map<string, string[]>();
    for (const r of rows) {
      const storeId = storeByName.get(norm(r.store))!;
      byStore.set(storeId, [...(byStore.get(storeId) ?? []), r.orderNumber.trim()]);
    }
    const existing = await prisma.order.findMany({
      where: { OR: [...byStore].map(([storeId, refs]) => ({ storeId, reference: { in: refs } })) },
      select: { id: true, storeId: true, reference: true, articles: true, status: true, slotId: true, raw: true },
    });
    const existingByKey = new Map(existing.map((o) => [`${o.storeId}|${o.reference}`, o]));

    const creates: Prisma.OrderCreateManyInput[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    let unchanged = 0;
    for (const r of rows) {
      const storeId = storeByName.get(norm(r.store))!;
      const reference = r.orderNumber.trim();
      const slotId = slotIds.get(`${storeId}|${r.date}|${r.slot}`)!;
      const current = existingByKey.get(`${storeId}|${reference}`);
      const status = classifyStatus(r.raw); // recalculé côté serveur : le navigateur n'est pas cru sur parole
      if (!current) {
        creates.push({ storeId, slotId, reference, articles: r.products, status, raw: r.raw as Prisma.InputJsonValue });
      } else if (
        current.articles !== r.products ||
        current.status !== status ||
        current.slotId !== slotId ||
        stable(current.raw) !== stable(r.raw)
      ) {
        updates.push(
          prisma.order.update({
            where: { id: current.id },
            data: { slotId, articles: r.products, status, raw: r.raw as Prisma.InputJsonValue },
          }),
        );
      } else {
        unchanged++;
      }
    }
    await prisma.$transaction([
      ...updates,
      prisma.order.createMany({ data: creates, skipDuplicates: true }),
    ]);

    // Chaque nouveau magasin Hyper reçoit automatiquement son compte Master Magasin.
    const accounts = await ensureStoreAccounts();
    if (accounts.length > 0) {
      await notifyOps({
        type: "accounts_created",
        title: `${accounts.length} compte(s) magasin créé(s)`,
        message: `Comptes créés pour : ${accounts.map((a) => a.storeName).join(", ")}. Les adresses e-mail sont listées dans « Comptes magasins » ; les mots de passe temporaires ne sont affichés qu'une seule fois, à l'import (sinon, utilisez « Réinitialiser le mot de passe »).`,
      });
    }

    await bumpVersion();
    revalidatePath("/", "layout"); // la sidebar se met à jour avec les magasins du fichier
    return { ok: true, added: creates.length, updated: updates.length, unchanged, skipped: problems.length, problems: problems.slice(0, 20), accounts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue pendant l'import." };
  }
}

/**
 * Clear Data : supprime les commandes importées et leurs créneaux (donc les nombres de pickers).
 * L'historique des distributions n'est supprimé que si demandé. Les magasins et les comptes sont conservés.
 */
export async function clearDataAction(input: {
  alsoHistory: boolean;
}): Promise<ImportResult<{ orders: number; history: number }>> {
  try {
    await requireImporter();
    const [orders, , history] = await prisma.$transaction([
      prisma.order.deleteMany(),
      prisma.workSlot.deleteMany(),
      input.alsoHistory ? prisma.distribution.deleteMany() : prisma.distribution.count(),
    ]);
    await bumpVersion();
    revalidatePath("/", "layout");
    return { ok: true, orders: orders.count, history: input.alsoHistory ? (history as { count: number }).count : 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

/**
 * Enregistre le résultat d'une synchronisation du fichier (appelé par le navigateur qui surveille le .xlsm) :
 * il alimente l'indicateur « dernière synchronisation réussie » visible dans tous les comptes.
 */
export async function recordSyncAction(input: { ok: boolean; error?: string }): Promise<ImportResult> {
  try {
    await requireImporter();
    await recordSync(input.ok, input.error);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}
