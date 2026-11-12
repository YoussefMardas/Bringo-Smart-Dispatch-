import { portalBase } from "@/lib/portal";
import { isDispatchable } from "@/lib/order-status";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getStoreOrNotFound } from "@/lib/permissions";
import { formatDateFr, formatSlot, resolveSelection, toDbDate } from "@/lib/slots";
import { getSlotOptions } from "@/lib/slot-options";
import { fmt, fmtMinutes } from "@/lib/utils";
import type { StoredDistribution } from "@/lib/stored";
import { SlotPicker } from "@/components/slot-picker";
import { KpiCard } from "@/components/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoData } from "@/components/no-data";

interface PageProps {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ params, searchParams }: PageProps) {
  const { storeId } = await params;
  const base = await portalBase();
  const user = await requireUser();
  const store = await getStoreOrNotFound(user, storeId);
  const options = await getSlotOptions(storeId);
  const { date, slot } = resolveSelection(options, await searchParams);
  if (slot === null) return <NoData title="Dashboard" storeName={store.name} role={user.role} />;
  const dbDate = toDbDate(date);

  const [workSlot, latest] = await Promise.all([
    prisma.workSlot.findUnique({
      where: { storeId_date_slot: { storeId, date: dbDate, slot } },
      include: { orders: { select: { articles: true, status: true } } },
    }),
    prisma.distribution.findFirst({
      where: { storeId, date: dbDate, slot },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const all = workSlot?.orders ?? [];
  const received = all.length;
  const cancelled = all.filter((o) => o.status === "CANCELLED").length;
  const accepted = all.filter((o) => isDispatchable(o.status) && o.articles >= 1); // OK + Retard : base du dispatch
  const late = accepted.filter((o) => o.status === "LATE").length;
  const others = received - cancelled - all.filter((o) => isDispatchable(o.status)).length;
  const totalOrders = accepted.length;
  const totalArticles = accepted.reduce((s, o) => s + o.articles, 0);
  const pickers = workSlot?.pickers ?? 0;
  const distributedOrders = latest?.orderCount ?? 0;
  const stored = latest ? (latest.result as unknown as StoredDistribution) : null;
  const minutesPerArticle = stored?.minutesPerArticle ?? 1;
  const query = `?date=${date}&slot=${encodeURIComponent(slot)}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={store.name} title="Dashboard" description={`${formatDateFr(date)} · ${formatSlot(slot)}`}>
        <SlotPicker options={options} date={date} slot={slot} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Commandes reçues" value={received} hint={others > 0 ? `${others} autre(s) statut(s)` : undefined} />
        <KpiCard label="Commandes acceptées" value={totalOrders} hint={`dont ${late} en retard`} />
        <KpiCard label="Commandes annulées" value={cancelled} hint="Exclues du dispatch" />
        <KpiCard label="Total articles" value={fmt(totalArticles)} />
        <KpiCard label="Pickers alloués" value={pickers} />
        <KpiCard
          label="Commandes distribuées"
          value={distributedOrders}
          hint={latest ? (latest.orderCount !== totalOrders ? "À régénérer : commandes modifiées" : undefined) : "Aucune distribution enregistrée"}
        />
        <KpiCard
          label="Articles par picker"
          value={pickers > 0 ? fmt(totalArticles / pickers) : "—"}
          hint={pickers > 0 ? "Moyenne théorique" : "Renseignez les pickers"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dernière distribution enregistrée</CardTitle>
          <CardDescription>Pour le créneau sélectionné.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {latest && stored ? (
            <>
              <p className="text-sm">
                {latest.orderCount} commandes · {fmt(latest.totalArticles)} articles · {latest.pickerCount} pickers · fin
                estimée <strong>{fmtMinutes(latest.makespan * minutesPerArticle)}</strong>
              </p>
              <div className="flex flex-col gap-2">
                {stored.result.pickers.map((p) => {
                  const max = Math.max(1, ...stored.result.pickers.map((x) => x.workedArticles));
                  return (
                    <div key={p.picker} className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3 text-sm">
                      <span>Picker {p.picker}</span>
                      <div className="h-3 overflow-hidden rounded bg-muted">
                        <div className="h-full rounded bg-primary" style={{ width: `${(p.workedArticles / max) * 100}%` }} />
                      </div>
                      <span className="text-right tabular-nums text-muted-foreground">{fmt(p.workedArticles)}</span>
                    </div>
                  );
                })}
              </div>
              <div>
                <Link href={`${base}/${storeId}/history/${latest.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Voir le détail
                </Link>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">Aucune distribution n'a encore été enregistrée pour ce créneau.</p>
              <Link href={`${base}/${storeId}/distribution${query}`} className={buttonVariants()}>
                Préparer la distribution
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
