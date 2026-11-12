"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { bumpVersion } from "@/lib/sync-state";

export type ImportResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; error: string };

/** Clear Data : Super Admin et Master Opérations. */
async function requireImporter() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN" && user.role !== "OPS_MASTER") {
    throw new Error("Réservé au Super Admin et au Master Opérations E-commerce.");
  }
  return user;
}

/**
 * Clear Data : supprime les commandes synchronisées et leurs créneaux (donc les nombres de pickers).
 * L'historique des distributions n'est supprimé que si demandé. Les magasins et les comptes sont conservés.
 * La source étant synchronisée en continu, les commandes qu'elle contient sont rechargées à la passe suivante.
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
