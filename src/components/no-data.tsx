import { portalBase } from "@/lib/portal";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function NoData({ title, storeName, role }: { title: string; storeName: string; role: string }) {
  const base = await portalBase();
  const canImport = role === "SUPER_ADMIN" || role === "OPS_MASTER";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={storeName} title={title} />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Aucune commande importée pour ce magasin</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
          {canImport ? (
            <>
              <p>Aucune commande synchronisée pour ce magasin pour le moment : vérifiez la source de données.</p>
              <Link href={`${base}/import`} className={buttonVariants()}>
                Voir la source
              </Link>
            </>
          ) : (
            <p>Les données seront disponibles après l'import du fichier par un administrateur.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
