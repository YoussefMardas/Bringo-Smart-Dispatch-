import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { portalBase } from "@/lib/portal";
import { getSyncState, type SyncSummary } from "@/lib/sync-state";
import { sourceConfigured } from "@/lib/source-sync";
import { SourcePanel } from "@/components/source-panel";

export default async function ImportPage() {
  const user = await requireUser();
  const base = await portalBase();
  if (user.role !== "SUPER_ADMIN" && user.role !== "OPS_MASTER") redirect(`${base}/`);

  const [stores, historyCount, state] = await Promise.all([
    prisma.store.findMany({
      where: { orders: { some: {} } },
      select: { id: true, name: true, _count: { select: { orders: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.distribution.count(),
    getSyncState(),
  ]);

  return (
    <SourcePanel
      configured={sourceConfigured()}
      current={stores.map((s) => ({ id: s.id, name: s.name, orders: s._count.orders }))}
      historyCount={historyCount}
      sync={{
        status: state?.lastStatus ?? "idle",
        lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
        lastError: state?.lastError ?? null,
        failures: state?.failures ?? 0,
        nextAttemptAt: state?.nextAttemptAt?.toISOString() ?? null,
        summary: (state?.lastSummary as SyncSummary | null) ?? null,
      }}
    />
  );
}
