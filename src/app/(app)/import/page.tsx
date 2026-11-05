import { portalBase } from "@/lib/portal";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ImportPanel } from "@/components/import-panel";

export default async function ImportPage() {
  const user = await requireUser();
  const base = await portalBase();
  if (user.role !== "SUPER_ADMIN" && user.role !== "OPS_MASTER") redirect(`${base}/`);

  const stores = await prisma.store.findMany({
    where: { orders: { some: {} } },
    select: { id: true, name: true, _count: { select: { orders: true } } },
    orderBy: { name: "asc" },
  });
  const historyCount = await prisma.distribution.count();

  return (
    <ImportPanel
      current={stores.map((s) => ({ id: s.id, name: s.name, orders: s._count.orders }))}
      historyCount={historyCount}
    />
  );
}
