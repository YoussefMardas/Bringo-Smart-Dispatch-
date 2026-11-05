"use client";

import { usePathname } from "next/navigation";

/** Préfixe d'URL du portail courant : « /magasin » pour les Masters Magasin, « » sinon. */
export function usePortalBase(): string {
  const p = usePathname();
  return p === "/magasin" || p.startsWith("/magasin/") ? "/magasin" : "";
}
