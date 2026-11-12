import { portalBase } from "@/lib/portal";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getStoreOrNotFound } from "@/lib/permissions";
import { formatDateFr, formatSlot, fromDbDate } from "@/lib/slots";
import { fmt } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function HistoryPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const base = await portalBase();
  const user = await requireUser();
  const store = await getStoreOrNotFound(user, storeId);

  const items = await prisma.distribution.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={store.name} title="Historique" description="100 dernières distributions enregistrées." />

      <Card>
        <CardContent className="pt-5">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucune distribution enregistrée.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Créneau</TH>
                  <TH className="text-right">Commandes</TH>
                  <TH className="text-right">Articles</TH>
                  <TH className="text-right">Pickers</TH>
                  <TH>Enregistrée par</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {items.map((d) => (
                  <TR key={d.id}>
                    <TD>{formatDateFr(fromDbDate(d.date))}</TD>
                    <TD>{formatSlot(d.slot)}</TD>
                    <TD className="text-right tabular-nums">{d.orderCount}</TD>
                    <TD className="text-right tabular-nums">{fmt(d.totalArticles)}</TD>
                    <TD className="text-right tabular-nums">{d.pickerCount}</TD>
                    <TD className="text-muted-foreground">
                      {d.createdBy?.name ?? "—"} ·{" "}
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Africa/Casablanca",
                      }).format(d.createdAt)}
                    </TD>
                    <TD className="text-right">
                      <Link href={`${base}/${storeId}/history/${d.id}`} className="text-primary underline">
                        Consulter
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
