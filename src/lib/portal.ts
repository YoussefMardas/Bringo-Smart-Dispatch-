import "server-only";
import { headers } from "next/headers";
import type { Role } from "@prisma/client";

export type Portal = "ops" | "store";

/** Portail de la requête en cours (défini par le middleware). */
export async function getPortal(): Promise<Portal> {
  return (await headers()).get("x-portal") === "store" ? "store" : "ops";
}

export async function portalBase(): Promise<string> {
  return (await getPortal()) === "store" ? "/magasin" : "";
}

/** Un Master Magasin vit dans le portail /magasin ; les autres rôles dans le portail principal. */
export const portalOf = (role: Role): Portal => (role === "STORE_MASTER" ? "store" : "ops");
