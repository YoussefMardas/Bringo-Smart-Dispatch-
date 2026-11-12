import { DISPATCH_WHERE } from "@/lib/order-status";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getStoreOrNotFound } from "@/lib/permissions";
import { formatDateFr, formatSlot, resolveSelection, toDbDate } from "@/lib/slots";
import { getSlotOptions } from "@/lib/slot-options";
import { NoData } from "@/components/no-data";
import { SlotPicker } from "@/components/slot-picker";
import { DistributionWorkspace } from "@/components/distribution/workspace";

interface PageProps {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DistributionPage({ params, searchParams }: PageProps) {
  const { storeId } = await params;
  const user = await requireUser();
  const store = await getStoreOrNotFound(user, storeId);
  const options = await getSlotOptions(storeId);
  const { date, slot } = resolveSelection(options, await searchParams);
  if (slot === null) return <NoData title="Dispatch" storeName={store.name} role={user.role} />;

  const workSlot = await prisma.workSlot.findUnique({
    where: { storeId_date_slot: { storeId, date: toDbDate(date), slot } },
    include: { orders: { where: DISPATCH_WHERE, orderBy: { createdAt: "asc" } } },
  });

  const orders = (workSlot?.orders ?? []).map((o) => ({ id: o.id, reference: o.reference, articles: o.articles }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={store.name} title="Dispatch" description={`${formatDateFr(date)} · ${formatSlot(slot)}`}>
        <SlotPicker options={options} date={date} slot={slot} />
      </PageHeader>

      {/* `key` : réinitialise l'état local quand le magasin, la date ou le créneau change. */}
      <DistributionWorkspace
        key={`${storeId}|${date}|${slot}`}
        storeId={storeId}
        date={date}
        slot={slot}
        storeName={store.name}
        initialPickers={workSlot?.pickers ?? 0}
        orders={orders}
      />
    </div>
  );
}
