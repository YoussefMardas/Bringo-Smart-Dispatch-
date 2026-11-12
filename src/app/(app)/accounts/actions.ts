"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { ensureStoreAccounts, resetPendingPasswords, resetStoreAccountPassword, type CreatedAccount } from "@/lib/accounts";

async function requireManager() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN" && user.role !== "OPS_MASTER") throw new Error("Accès réservé.");
}

export type AccountsResult = { ok: true; accounts: CreatedAccount[] } | { ok: false; error: string };

/** Crée les comptes manquants des magasins Hyper et renvoie leurs identifiants (affichés une seule fois). */
export async function createMissingAccountsAction(): Promise<AccountsResult> {
  try {
    await requireManager();
    const accounts = await ensureStoreAccounts();
    revalidatePath("/accounts");
    return { ok: true, accounts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

/** Génère les mots de passe temporaires de tous les comptes jamais utilisés (créés automatiquement par la synchronisation). */
export async function resetPendingPasswordsAction(): Promise<AccountsResult> {
  try {
    await requireManager();
    const accounts = await resetPendingPasswords();
    revalidatePath("/accounts");
    return { ok: true, accounts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

export async function resetAccountPasswordAction(userId: string): Promise<AccountsResult> {
  try {
    await requireManager();
    const r = await resetStoreAccountPassword(userId);
    if (!r) return { ok: false, error: "Compte introuvable." };
    revalidatePath("/accounts");
    return { ok: true, accounts: [{ storeId: "", storeName: r.storeName, email: r.email, password: r.password }] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}
