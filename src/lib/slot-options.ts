import "server-only";
import { prisma } from "@/lib/prisma";
import { DISPATCH_WHERE } from "@/lib/order-status";
import { buildSlotOptions, fromDbDate, todayString, type SlotOption } from "@/lib/slots";

/**
 * Dates et créneaux d'un magasin, relus à chaque affichage depuis les données importées :
 * un nouveau créneau apparaît tout seul. Le décompte ne compte que les commandes dispatchables (OK / Retard).
 */
export async function getSlotOptions(storeId: string): Promise<SlotOption[]> {
  const slots = await prisma.workSlot.findMany({
    where: { storeId },
    select: { date: true, slot: true, _count: { select: { orders: { where: DISPATCH_WHERE } } } },
  });
  return buildSlotOptions(
    slots.map((s) => ({ date: fromDbDate(s.date), slot: s.slot, orders: s._count.orders })),
    todayString(),
  );
}
