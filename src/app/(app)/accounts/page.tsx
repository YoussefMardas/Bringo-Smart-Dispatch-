import { portalBase } from "@/lib/portal";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isHyperStore } from "@/lib/order-source";
import { PageHeader } from "@/components/page-header";
import { AccountsManager, type AccountRow } from "@/components/accounts-manager";

export default async function AccountsPage() {
  const user = await requireUser();
  const base = await portalBase();
  if (user.role !== "SUPER_ADMIN" && user.role !== "OPS_MASTER") redirect(`${base}/`);

  const stores = (
    await prisma.store.findMany({
      where: { active: true },
      select: { id: true, name: true, users: { where: { role: "STORE_MASTER" }, select: { id: true, email: true, mustChangePassword: true }, take: 1 } },
      orderBy: { name: "asc" },
    })
  ).filter((s) => isHyperStore(s.name));

  const rows: AccountRow[] = stores.map((s) => ({
    storeId: s.id,
    storeName: s.name,
    userId: s.users[0]?.id ?? null,
    email: s.users[0]?.email ?? null,
    mustChangePassword: s.users[0]?.mustChangePassword ?? false,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pilotage"
        title="Comptes magasins"
        description="Un compte Master Magasin est créé automatiquement pour chaque magasin Hyper importé. L'e-mail est généré à partir du nom du magasin."
      />
      <AccountsManager rows={rows} />
    </div>
  );
}
