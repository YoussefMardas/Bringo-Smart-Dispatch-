import { syncIfDue } from "@/lib/source-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Déclencheur optionnel pour un planificateur externe (Vercel Cron sur plan Pro, GitHub Actions, cron-job.org…) :
 * garde les données à jour même sans navigateur ouvert. Protégé par `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  await syncIfDue();
  return Response.json({ ok: true });
}
