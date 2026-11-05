import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Diagnostic des erreurs 500 : vérifie la connexion à la base et que chaque table / colonne attendue existe
 * (symptôme classique : `npm run db:deploy` ou `prisma generate` oubliés après une mise à jour).
 * Ne renvoie aucune donnée, uniquement ok / erreur par contrôle.
 */
export async function GET() {
  const checks: Record<string, string> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      checks[name] = "ok";
    } catch (e) {
      checks[name] = e instanceof Error ? e.message.split("\n").filter(Boolean).pop()!.slice(0, 200) : "erreur";
    }
  };
  await run("connexion", () => prisma.$queryRaw`SELECT 1`);
  await run("utilisateurs", () => prisma.user.count({ where: { mustChangePassword: false } }));
  await run("commandes.status", () => prisma.order.count({ where: { status: "OK" } }));
  await run("notifications", () => prisma.notification.count());
  await run("synchronisation", () => prisma.syncState.count());
  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json(
    { ok, checks, fix: ok ? undefined : "Exécutez : npx prisma generate && npm run db:deploy, puis redémarrez le serveur." },
    { status: ok ? 200 : 503 },
  );
}
