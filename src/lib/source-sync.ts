import "server-only";
import { parseRedashCsv } from "@/lib/order-source";
import { ingestRows, MAX_ROWS_PER_CHUNK, type ImportRow } from "@/lib/ingest";
import { ensureStoreAccounts } from "@/lib/accounts";
import { notifyOps } from "@/lib/notifications";
import { finishSync, tryAcquireSync, type SyncSummary } from "@/lib/sync-state";

/** URL du CSV Redash (contient la clé d'API) : variable d'environnement serveur uniquement, jamais envoyée au navigateur. */
const sourceUrl = () => process.env.REDASH_CSV_URL?.trim() || "";

export const sourceConfigured = () => sourceUrl() !== "";

/** Retire toute clé d'API d'un message d'erreur avant de l'enregistrer ou de l'afficher. */
const scrub = (msg: string) => msg.replace(/api_key=[^&\s"')]+/gi, "api_key=***").replace(/https?:\/\/\S+/g, "[source]");

async function fetchCsv(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(sourceUrl(), { cache: "no-store", signal: AbortSignal.timeout(45_000), headers: { Accept: "text/csv" } });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new Error(timeout ? "La source ne répond pas (délai de 45 s dépassé)." : `Source injoignable : ${scrub(e instanceof Error ? e.message : "erreur réseau")}.`);
  }
  if (!res.ok) {
    throw new Error(res.status === 401 || res.status === 403 ? "Accès refusé par la source (clé d'API invalide ou expirée)." : `La source a répondu HTTP ${res.status}.`);
  }
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("La source a renvoyé une page web au lieu d'un CSV (clé d'API ou URL incorrecte).");
  return text;
}

/** Une passe complète : lecture du CSV, ingestion par lots, comptes magasins, notification. Lève en cas d'échec. */
async function runOnce(): Promise<{ summary: SyncSummary; changed: boolean }> {
  const started = Date.now();
  const parsed = parseRedashCsv(await fetchCsv());

  // Jours récents d'abord (aujourd'hui en priorité) ; un lot en échec n'interrompt pas les suivants.
  const rows: ImportRow[] = [...parsed.orders]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((o) => ({ orderNumber: o.orderNumber, store: o.store, slot: o.slot, date: o.date, products: o.products, raw: o.raw }));
  let added = 0, updated = 0, unchanged = 0, skipped = 0;
  const problems = [...parsed.errors.slice(0, 10)];
  const failures: string[] = [];
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_CHUNK) {
    try {
      const r = await ingestRows({ rows: rows.slice(i, i + MAX_ROWS_PER_CHUNK) });
      added += r.added;
      updated += r.updated;
      unchanged += r.unchanged;
      skipped += r.skipped;
      problems.push(...r.problems);
    } catch (e) {
      failures.push(`lignes ${i + 1}–${Math.min(i + MAX_ROWS_PER_CHUNK, rows.length)} : ${scrub(e instanceof Error ? e.message : "erreur")}`);
    }
  }
  if (failures.length) throw new Error(`Import partiel, ${failures.length} lot(s) en échec (${failures[0]}). Nouvelle tentative automatique.`);

  // Chaque Hyper reçoit son compte Master Magasin (mot de passe temporaire : à générer dans « Comptes magasins »).
  const accounts = await ensureStoreAccounts();
  if (accounts.length > 0) {
    await notifyOps({
      type: "accounts_created",
      title: `${accounts.length} compte(s) magasin créé(s)`,
      message: `Comptes créés pour : ${accounts.map((a) => a.storeName).join(", ")}. Ouvrez « Comptes magasins » pour générer leurs mots de passe temporaires.`,
    });
  }

  return {
    changed: added + updated > 0 || accounts.length > 0,
    summary: {
      at: new Date().toISOString(),
      durationMs: Date.now() - started,
      rowsRead: parsed.totalRows,
      hyperOrders: parsed.orders.length,
      skippedNonHyper: parsed.skippedNonHyper,
      added,
      updated,
      unchanged,
      skipped: skipped + parsed.errors.length,
      problems: problems.slice(0, 20),
    },
  };
}

/**
 * Lance une synchronisation si la source est configurée et qu'une passe est due (verrou + planification en base).
 * Succès : prochaine passe dans 60 s. Échec : l'erreur est enregistrée (visible dans la barre de statut) et la
 * passe est relancée automatiquement après 5, 10, 20, 40 puis 60 s.
 */
export async function syncIfDue(): Promise<void> {
  if (!sourceConfigured() || !(await tryAcquireSync())) return;
  try {
    const { summary, changed } = await runOnce();
    await finishSync({ ok: true, changed, summary });
  } catch (e) {
    await finishSync({ ok: false, changed: false, error: scrub(e instanceof Error ? e.message : "Erreur de synchronisation.") });
  }
}
