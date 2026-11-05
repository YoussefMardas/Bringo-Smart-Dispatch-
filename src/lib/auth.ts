import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPortal, portalBase, portalOf } from "@/lib/portal";

const COOKIES = { ops: "bsd_ops", store: "bsd_store" } as const; // une session par portail : les deux comptes coexistent
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 h

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  storeId: string | null;
  mustChangePassword: boolean;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum).");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) throw new Error("Utilisateur introuvable.");
  const jar = await cookies();
  jar.set(COOKIES[portalOf(user.role)], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIES[await getPortal()]); // seule la session du portail courant est fermée
}

/** Utilisateur courant (rechargé en base : un rôle modifié s'applique immédiatement). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const portal = await getPortal();
  const token = jar.get(COOKIES[portal])?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, storeId: true, mustChangePassword: true },
    });
    return user && portalOf(user.role) === portal ? user : null;
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`${await portalBase()}/login`);
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect(`${await portalBase()}/`);
  return user;
}
