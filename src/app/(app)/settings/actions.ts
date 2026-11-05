"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export interface FormState {
  error?: string;
  success?: string;
}

async function assertSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") throw new Error("Réservé au Super Admin.");
  return user;
}

function uniqueMessage(e: unknown, fallback: string): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fallback;
  return e instanceof Error ? e.message : "Erreur inattendue.";
}

export async function createStoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await assertSuperAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const city = String(formData.get("city") ?? "").trim() || null;
    if (!name || !code) return { error: "Nom et code sont obligatoires." };
    await prisma.store.create({ data: { name, code, city } });
    revalidatePath("/", "layout");
    return { success: `Magasin « ${name} » créé.` };
  } catch (e) {
    return { error: uniqueMessage(e, "Ce code magasin existe déjà.") };
  }
}

export async function renameStoreAction(formData: FormData): Promise<void> {
  await assertSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await prisma.store.update({ where: { id }, data: { name } });
  revalidatePath("/", "layout");
}

export async function toggleStoreAction(formData: FormData): Promise<void> {
  await assertSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const store = await prisma.store.findUnique({ where: { id } });
  if (!store) return;
  await prisma.store.update({ where: { id }, data: { active: !store.active } });
  revalidatePath("/", "layout");
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await assertSuperAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "") as Role;
    const storeId = String(formData.get("storeId") ?? "") || null;

    if (!name || !email) return { error: "Nom et e-mail sont obligatoires." };
    if (password.length < 8) return { error: "Le mot de passe doit contenir au moins 8 caractères." };
    if (!["SUPER_ADMIN", "OPS_MASTER", "STORE_MASTER"].includes(role)) return { error: "Rôle invalide." };
    if (role === "STORE_MASTER" && !storeId) return { error: "Un Master Magasin doit être rattaché à un magasin." };

    await prisma.user.create({
      data: {
        name,
        email,
        role,
        storeId: role === "STORE_MASTER" ? storeId : null,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    revalidatePath("/settings");
    return { success: `Utilisateur ${email} créé.` };
  } catch (e) {
    return { error: uniqueMessage(e, "Cet e-mail est déjà utilisé.") };
  }
}
