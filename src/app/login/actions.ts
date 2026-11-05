"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/auth";
import { portalBase, portalOf } from "@/lib/portal";

export interface LoginState {
  error?: string;
}

// Hash factice pour garder un temps de réponse comparable si l'e-mail n'existe pas.
const DUMMY_HASH = bcrypt.hashSync("bsd-dummy-password", 10);

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Saisissez votre e-mail et votre mot de passe." };

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "E-mail ou mot de passe incorrect." };

  await createSession(user.id);
  // Le Master Magasin arrive dans son portail (/magasin), les autres rôles dans le portail principal.
  redirect(portalOf(user.role) === "store" ? "/magasin" : "/");
}

export async function logoutAction(): Promise<void> {
  const base = await portalBase();
  await destroySession();
  redirect(`${base}/login`);
}
