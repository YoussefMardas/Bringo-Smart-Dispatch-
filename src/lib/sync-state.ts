import "server-only";
import { prisma } from "@/lib/prisma";

const ID = "main";

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

/** Enregistre le résultat d'une synchronisation de fichier (succès : horodatage ; échec : message). */
export async function recordSync(ok: boolean, error?: string): Promise<void> {
  const now = new Date();
  await prisma.syncState.upsert({
    where: { id: ID },
    update: {
      version: { increment: 1 },
      lastStatus: ok ? "ok" : "error",
      lastError: ok ? null : (error ?? "Erreur inconnue").slice(0, 300),
      ...(ok ? { lastSuccessAt: now } : {}),
    },
    create: {
      id: ID,
      version: 1,
      lastStatus: ok ? "ok" : "error",
      lastError: ok ? null : (error ?? "Erreur inconnue").slice(0, 300),
      lastSuccessAt: ok ? now : null,
    },
  });
}

export async function getSyncState() {
  return prisma.syncState.findUnique({ where: { id: ID } });
}
