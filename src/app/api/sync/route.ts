import { after } from "next/server";
import { sourceConfigured, syncIfDue } from "@/lib/source-sync";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSyncState, isDue } from "@/lib/sync-state";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // la passe de synchronisation continue après la réponse (Vercel)

/**
 * Interrogé régulièrement par chaque navigateur ouvert :
 * - `version` change dès qu'une donnée est modifiée/importée → la page se rafraîchit toute seule ;
 * - `lastSuccessAt` / `lastStatus` alimentent l'indicateur de synchronisation ;
 * - `unread` / `latest` alimentent les notifications.
 */
export async function GET() {
  try {
    return await handle();
  } catch (e) {
    // Panne de base ou schéma non migré : réponse 503 explicite (le navigateur réessaie seul), jamais un 500 opaque.
    console.error("[api/sync]", e);
    return Response.json({ error: "unavailable", hint: "Vérifiez /api/health (base de données et migrations)." }, { status: 503 });
  }
}

async function handle() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const [state, unread, latest] = await Promise.all([
    getSyncState(),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, message: true, createdAt: true, readAt: true },
    }),
  ]);

  // Chaque navigateur ouvert fait office de déclencheur : si une passe est due, elle part en arrière-plan.
  if (sourceConfigured() && isDue(state)) after(() => syncIfDue().catch((e) => console.error("[source-sync]", e)));

  return Response.json(
    {
      version: state?.version ?? 0,
      lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
      lastStatus: state?.lastStatus ?? "idle",
      lastError: state?.lastError ?? null,
      unread,
      latest: latest.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt.toISOString(),
        read: n.readAt !== null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
