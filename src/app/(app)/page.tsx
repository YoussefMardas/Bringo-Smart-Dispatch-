import { portalBase } from "@/lib/portal";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listSidebarStores } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const user = await requireUser();
  const base = await portalBase();
  const stores = await listSidebarStores(user);
  if (stores[0]) redirect(`${base}/${stores[0].id}/dashboard`);
  const canImport = user.role === "SUPER_ADMIN" || user.role === "OPS_MASTER";

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Aucune donnée</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {canImport ? (
          <>
            Aucune donnée importée. Rendez-vous dans{" "}
            <Link href={`${base}/import`} className="text-primary underline">
              Source des données
            </Link>{" "}
            pour vérifier la source Redash : les magasins apparaîtront dans la barre latérale dès la première synchronisation.
          </>
        ) : (
          "Aucune donnée disponible pour votre magasin pour le moment."
        )}
      </CardContent>
    </Card>
  );
}
