import "server-only";
import { notFound } from "next/navigation";
import type { Store } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

/**
 * Règles d'accès
 * - SUPER_ADMIN  : tous les magasins (actifs ou non) + paramètres.
 * - OPS_MASTER   : tous les magasins actifs.
 * - STORE_MASTER : uniquement son magasin (s'il est actif).
 */
export async function listAccessibleStores(user: SessionUser): Promise<Store[]> {
  if (user.role === "SUPER_ADMIN") {
    return prisma.store.findMany({ orderBy: { name: "asc" } });
  }
  if (user.role === "OPS_MASTER") {
    return prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }
  if (!user.storeId) return [];
  return prisma.store.findMany({ where: { id: user.storeId, active: true } });
}

/**
 * Magasins affichés dans la sidebar : accessibles à l'utilisateur ET qui ont des données
 * (commandes importées ou historique). La liste suit donc chaque import / Clear Data.
 */
export async function listSidebarStores(user: SessionUser): Promise<Store[]> {
  const hasData = { OR: [{ orders: { some: {} } }, { distributions: { some: {} } }] };
  if (user.role === "SUPER_ADMIN") {
    return prisma.store.findMany({ where: hasData, orderBy: { name: "asc" } });
  }
  if (user.role === "OPS_MASTER") {
    return prisma.store.findMany({ where: { active: true, ...hasData }, orderBy: { name: "asc" } });
  }
  if (!user.storeId) return [];
  return prisma.store.findMany({ where: { id: user.storeId, active: true, ...hasData } });
}

/** Retourne le magasin si l'utilisateur y a accès, sinon 404. */
export async function getStoreOrNotFound(user: SessionUser, storeId: string): Promise<Store> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || !canAccessStore(user, store)) notFound();
  return store;
}

export function canAccessStore(user: SessionUser, store: Pick<Store, "id" | "active">): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (!store.active) return false;
  if (user.role === "OPS_MASTER") return true;
  return user.storeId === store.id;
}
