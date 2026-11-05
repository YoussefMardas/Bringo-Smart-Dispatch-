"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/permissions";
import { isDateString, toDbDate } from "@/lib/slots";
import { MAX_ORDERS_PER_PICKER } from "@/lib/rules";
import { evaluateAssignment, DEFAULT_MIN_ASSIST_CHUNK } from "@/lib/distribution";
import type { Strategy } from "@/lib/distribution";
import type { StoredDistribution } from "@/lib/stored";
import { DISPATCH_WHERE } from "@/lib/order-status";
import { bumpVersion } from "@/lib/sync-state";
import { notifyOps } from "@/lib/notifications";
import { pickerChangeText } from "@/lib/notification-text";
import { formatSlot } from "@/lib/slots";

export type ActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : T)) | { ok: false; error: string };

const MAX_ARTICLES = 10_000;
const MAX_PICKERS = 200;

interface SlotRef {
  storeId: string;
  date: string;
  slot: string;
}

async function authorize(storeId: string) {
  const user = await requireUser();
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || !canAccessStore(user, store)) throw new Error("Accès refusé à ce magasin.");
  return user;
}

function checkSlotRef({ date, slot }: SlotRef): string | null {
  if (!isDateString(date)) return "Date invalide.";
  if (typeof slot !== "string" || !slot.trim() || slot.length > 40) return "Créneau invalide.";
  return null;
}

function checkOrder(reference: string, articles: number): string | null {
  if (!reference.trim()) return "La référence est obligatoire.";
  if (reference.trim().length > 40) return "La référence est trop longue (40 caractères maximum).";
  if (!Number.isInteger(articles) || articles < 1 || articles > MAX_ARTICLES) {
    return `Le nombre d'articles doit être un entier entre 1 et ${MAX_ARTICLES}.`;
  }
  return null;
}

async function refresh(storeId: string) {
  await bumpVersion(); // les autres comptes ouverts se rafraîchissent automatiquement
  revalidatePath(`/${storeId}/distribution`);
  revalidatePath(`/${storeId}/dashboard`);
  revalidatePath(`/${storeId}/history`);
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// --- Commandes (alimentées uniquement par l'import .xlsm ; pas d'ajout manuel) ---

export async function updateOrderAction(input: {
  storeId: string;
  orderId: string;
  reference: string;
  articles: number;
}): Promise<ActionResult> {
  try {
    await authorize(input.storeId);
    const err = checkOrder(input.reference, input.articles);
    if (err) return { ok: false, error: err };

    // Le filtre sur storeId empêche de modifier la commande d'un autre magasin.
    const { count } = await prisma.order.updateMany({
      where: { id: input.orderId, slot: { storeId: input.storeId } },
      data: { reference: input.reference.trim(), articles: input.articles },
    });
    if (count === 0) return { ok: false, error: "Commande introuvable." };
    await refresh(input.storeId);
    return { ok: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Cette référence existe déjà pour ce créneau." };
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

export async function deleteOrderAction(input: { storeId: string; orderId: string }): Promise<ActionResult> {
  try {
    await authorize(input.storeId);
    await prisma.order.deleteMany({ where: { id: input.orderId, slot: { storeId: input.storeId } } });
    await refresh(input.storeId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

// --- Pickers ---------------------------------------------------------------

export async function setPickersAction(input: SlotRef & { pickers: number }): Promise<ActionResult> {
  try {
    const user = await authorize(input.storeId);
    const err = checkSlotRef(input);
    if (err) return { ok: false, error: err };
    if (!Number.isInteger(input.pickers) || input.pickers < 1 || input.pickers > MAX_PICKERS) {
      return { ok: false, error: `Le nombre de pickers doit être un entier entre 1 et ${MAX_PICKERS}.` };
    }
    const where = { storeId_date_slot: { storeId: input.storeId, date: toDbDate(input.date), slot: input.slot } };
    const previous = await prisma.workSlot.findUnique({ where, select: { pickers: true } });
    await prisma.workSlot.upsert({
      where,
      update: { pickers: input.pickers },
      create: { storeId: input.storeId, date: toDbDate(input.date), slot: input.slot, pickers: input.pickers },
    });

    // Un Master Magasin qui change le nombre de pickers prévient le Master Opérations E-commerce.
    const before = previous?.pickers ?? 0;
    if (user.role === "STORE_MASTER" && before !== input.pickers) {
      const store = await prisma.store.findUnique({ where: { id: input.storeId }, select: { name: true } });
      const text = pickerChangeText({
        storeName: store?.name ?? "Magasin",
        actorName: user.name,
        before,
        after: input.pickers,
        date: input.date,
        slotLabel: formatSlot(input.slot),
      });
      await notifyOps({ type: "pickers_changed", storeId: input.storeId, ...text });
    }
    await refresh(input.storeId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

// --- Historique ------------------------------------------------------------

/**
 * Enregistre une distribution. Le serveur ne fait pas confiance au résultat calculé
 * côté client : il relit les commandes en base, valide l'affectation et recalcule.
 */
export async function saveDistributionAction(
  input: SlotRef & {
    assignment: string[][];
    strategy: Strategy;
    minAssistChunk: number;
    minutesPerArticle: number;
  },
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize(input.storeId);
    const err = checkSlotRef(input);
    if (err) return { ok: false, error: err };

    const slot = await prisma.workSlot.findUnique({
      where: { storeId_date_slot: { storeId: input.storeId, date: toDbDate(input.date), slot: input.slot } },
      include: { orders: { where: DISPATCH_WHERE, orderBy: { createdAt: "asc" } } },
    });
    if (!slot || slot.orders.length === 0) return { ok: false, error: "Aucune commande à distribuer sur ce créneau." };
    if (input.assignment.length !== slot.pickers) {
      return { ok: false, error: "Le nombre de pickers a changé : régénérez la distribution." };
    }

    const minAssistChunk =
      Number.isFinite(input.minAssistChunk) && input.minAssistChunk >= 0 ? input.minAssistChunk : DEFAULT_MIN_ASSIST_CHUNK;
    const minutesPerArticle =
      Number.isFinite(input.minutesPerArticle) && input.minutesPerArticle > 0 ? input.minutesPerArticle : 1;
    const strategy: Strategy = ["best-fit", "lpt", "manual"].includes(input.strategy) ? input.strategy : "manual";

    const orders = slot.orders.map((o) => ({ id: o.id, reference: o.reference, articles: o.articles }));
    let result;
    try {
      result = evaluateAssignment(
        orders,
        input.assignment,
        { minAssistChunk, maxOrdersPerPicker: MAX_ORDERS_PER_PICKER },
        strategy,
      );
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Distribution obsolète : régénérez-la." };
    }

    const payload: StoredDistribution = { version: 1, minAssistChunk, minutesPerArticle, orders, result };
    const saved = await prisma.distribution.create({
      data: {
        storeId: input.storeId,
        date: toDbDate(input.date),
        slot: input.slot,
        orderCount: result.totalOrders,
        totalArticles: result.totalArticles,
        pickerCount: slot.pickers,
        makespan: result.makespan,
        strategy: result.strategy,
        result: payload as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
    await refresh(input.storeId);
    return { ok: true, id: saved.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}
