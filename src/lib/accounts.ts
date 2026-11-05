import "server-only";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isHyperStore } from "@/lib/xlsm-import";
import { DEFAULT_EMAIL_DOMAIN, storeEmail } from "@/lib/account-names";
import { generatePassword } from "@/lib/passwords";

export interface CreatedAccount {
  storeId: string;
  storeName: string;
  email: string;
  /** Mot de passe temporaire : affiché une seule fois, seul son hash est conservé. */
  password: string;
}

const domain = () => process.env.ACCOUNT_EMAIL_DOMAIN?.trim() || DEFAULT_EMAIL_DOMAIN;

/**
 * Crée un compte Master Magasin pour chaque magasin Hyper actif qui n'en a pas.
 * Idempotent : un magasin déjà pourvu est ignoré ; en cas de création concurrente
 * (même e-mail), le doublon est écarté par la contrainte d'unicité.
 */
export async function ensureStoreAccounts(): Promise<CreatedAccount[]> {
  const stores = (await prisma.store.findMany({ where: { active: true }, select: { id: true, name: true } })).filter((s) =>
    isHyperStore(s.name),
  );
  if (stores.length === 0) return [];

  const withAccount = new Set(
    (
      await prisma.user.findMany({
        where: { role: "STORE_MASTER", storeId: { in: stores.map((s) => s.id) } },
        select: { storeId: true },
      })
    ).map((u) => u.storeId),
  );
  const missing = stores.filter((s) => !withAccount.has(s.id));
  if (missing.length === 0) return [];

  const taken = new Set((await prisma.user.findMany({ select: { email: true } })).map((u) => u.email));
  const created: CreatedAccount[] = [];
  for (const store of missing) {
    const email = storeEmail(store.name, domain(), taken);
    const password = generatePassword();
    try {
      await prisma.user.create({
        data: {
          email,
          name: `Master ${store.name}`,
          role: "STORE_MASTER",
          storeId: store.id,
          passwordHash: await bcrypt.hash(password, 10),
          mustChangePassword: true,
        },
      });
      taken.add(email);
      created.push({ storeId: store.id, storeName: store.name, email, password });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
    }
  }
  return created;
}

/** Nouveau mot de passe temporaire pour un compte Master Magasin. */
export async function resetStoreAccountPassword(userId: string): Promise<{ email: string; storeName: string; password: string } | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: "STORE_MASTER" },
    include: { store: { select: { name: true } } },
  });
  if (!user) return null;
  const password = generatePassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
  });
  return { email: user.email, storeName: user.store?.name ?? "", password };
}
