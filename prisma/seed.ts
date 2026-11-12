import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLOT = "08:00-10:00";

function todayUtcDate(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

async function main() {
  const password = process.env.SEED_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 10);

  // Magasins de démonstration (à renommer / compléter dans Paramètres).
  const stores = [];
  for (const [code, name, city] of [
    ["MAG-01", "Magasin Démo 1", "Casablanca"],
    ["MAG-02", "Magasin Démo 2", "Casablanca"],
    ["MAG-03", "Magasin Démo 3", "Rabat"],
  ] as const) {
    stores.push(
      await prisma.store.upsert({
        where: { code },
        update: {},
        create: { code, name, city },
      }),
    );
  }

  const users: { email: string; name: string; role: Role; storeId?: string }[] = [
    { email: "admin@bringo.local", name: "Super Admin", role: Role.SUPER_ADMIN },
    { email: "ops@bringo.local", name: "Master Opérations E-commerce", role: Role.OPS_MASTER },
    { email: "magasin1@bringo.local", name: "Master Magasin 1", role: Role.STORE_MASTER, storeId: stores[0].id },
    { email: "magasin2@bringo.local", name: "Master Magasin 2", role: Role.STORE_MASTER, storeId: stores[1].id },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  // Jeu de données de démonstration : l'exemple du cahier des charges, avec 4 pickers.
  const date = todayUtcDate();
  const slot = await prisma.workSlot.upsert({
    where: { storeId_date_slot: { storeId: stores[0].id, date, slot: SLOT } },
    update: {},
    create: { storeId: stores[0].id, date, slot: SLOT, pickers: 4 },
  });
  const demo: [string, number][] = [
    ["CMD-001", 80],
    ["CMD-002", 120],
    ["CMD-003", 20],
    ["CMD-004", 5],
    ["CMD-005", 65],
  ];
  await prisma.order.createMany({
    data: demo.map(([reference, articles]) => ({ storeId: stores[0].id, slotId: slot.id, reference, articles })),
    skipDuplicates: true,
  });

  console.log("Seed terminé. Comptes de démonstration (mot de passe : %s)", password);
  for (const u of users) console.log(` - ${u.role.padEnd(12)} ${u.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
