import { portalBase } from "@/lib/portal";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getStoreOrNotFound } from "@/lib/permissions";
import { formatDateFr, formatSlot, fromDbDate } from "@/lib/slots";
import type { StoredDistribution } from "@/lib/stored";
import { ResultView } from "@/components/distribution/result-view";

export default async function HistoryDetailPage({ params }: { params: Promise<{ storeId: string; id: string }> }) {
  const base = await portalBase();
  const { storeId, id } = await params;
  const user = await requireUser();
  const store = await getStoreOrNotFound(user, storeId);

  // Le filtre sur storeId empêche de lire la distribution d'un autre magasin via son identifiant.
  const item = await prisma.distribution.findFirst({ where: { id, storeId } });
  if (!item) notFound();

  const stored = item.result as unknown as StoredDistribution;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`${base}/${storeId}/history`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Historique
      </Link>
      <PageHeader
        eyebrow={store.name}
        title={`Distribution du ${formatDateFr(fromDbDate(item.date))}`}
        description={`${formatSlot(item.slot)} · ${item.pickerCount} pickers`}
      />
      <ResultView result={stored.result} orders={stored.orders} minutesPerArticle={stored.minutesPerArticle} />
    </div>
  );
}
