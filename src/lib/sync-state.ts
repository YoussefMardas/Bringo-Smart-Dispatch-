import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { backoffDelay } from "@/lib/retry";

const ID = "main";
export const SUCCESS_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_SECONDS ?? 60) * 1000 || 60_000;
const LOCK_MS = 75_000; // un peu plus que le délai maximal d'une fonction (60 s) : un verrou orphelin expire vite

export interface SyncSummary {
  at: string;
  durationMs: number;
  rowsRead: number;
  hyperOrders: number;
  skippedNonHyper: number;
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  problems: string[];
}

/** Signale à tous les navigateurs ouverts que les données ont changé (ils se rafraîchissent seuls). */
export async function bumpVersion(): Promise<void> {
  try {
    await prisma.syncState.upsert({
      where: { id: ID },
      update: { version: { increment: 1 } },
      create: { id: ID, version: 1 },
    });
  } catch {
    // Jamais bloquant : au pire, les autres écrans se rafraîchissent à leur prochaine navigation.
  }
}

/**
 * Prend le verrou de synchronisation si une passe est due. Atomique (un seul UPDATE conditionnel) :
 * avec plusieurs navigateurs ou plusieurs instances serveur, une seule passe démarre.
 */
export async function tryAcquireSync(): Promise<boolean> {
  await prisma.syncState.upsert({ where: { id: ID }, update: {}, create: { id: ID, version: 1 } });
  const now = new Date();
  const r = await prisma.syncState.updateMany({
    where: {
      id: ID,
      AND: [
        { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      ],
    },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  return r.count === 1;
}

/** Clôt une passe : libère le verrou, planifie la suivante (60 s, ou délai croissant après un échec). */
export async function finishSync(input: { ok: boolean; error?: string; changed: boolean; summary?: SyncSummary }): Promise<void> {
  const current = await prisma.syncState.findUnique({ where: { id: ID }, select: { failures: true } });
  const failures = input.ok ? 0 : (current?.failures ?? 0) + 1;
  const delay = input.ok ? SUCCESS_INTERVAL_MS : backoffDelay(failures - 1);
  await prisma.syncState.update({
    where: { id: ID },
    data: {
      lockedUntil: null,
      nextAttemptAt: new Date(Date.now() + delay),
      failures,
      lastStatus: input.ok ? "ok" : "error",
      lastError: input.ok ? null : (input.error ?? "Erreur inconnue").slice(0, 300),
      ...(input.ok ? { lastSuccessAt: new Date() } : {}),
      ...(input.summary ? { lastSummary: input.summary as unknown as Prisma.InputJsonValue } : {}),
      ...(input.changed ? { version: { increment: 1 } } : {}),
    },
  });
}

export async function getSyncState() {
  return prisma.syncState.findUnique({ where: { id: ID } });
}

/** Une passe est-elle due ? (lecture de l'état déjà chargé : aucune requête de plus à chaque interrogation des navigateurs) */
export function isDue(state: { nextAttemptAt: Date | null; lockedUntil: Date | null } | null): boolean {
  const now = Date.now();
  if (!state) return true;
  if (state.lockedUntil && state.lockedUntil.getTime() > now) return false;
  return !state.nextAttemptAt || state.nextAttemptAt.getTime() <= now;
}
