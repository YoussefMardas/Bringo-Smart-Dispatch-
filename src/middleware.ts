import { NextResponse, type NextRequest } from "next/server";

/**
 * Deux « portails » sur le même domaine, avec des sessions indépendantes :
 *   /…          → Master Ops / Super Admin   (cookie bsd_ops)
 *   /magasin/…  → Master Magasin             (cookie bsd_store)
 * /magasin est réécrit vers les mêmes pages ; l'en-tête x-portal indique au serveur quel cookie lire.
 * On peut ainsi être connecté aux deux comptes dans le même navigateur, dans des onglets différents.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const store = pathname === "/magasin" || pathname.startsWith("/magasin/");
  const headers = new Headers(req.headers);
  headers.set("x-portal", store ? "store" : "ops");

  if (store) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice("/magasin".length) || "/";
    return NextResponse.rewrite(url, { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
