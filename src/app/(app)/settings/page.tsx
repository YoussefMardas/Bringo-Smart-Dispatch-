import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { renameStoreAction, toggleStoreAction } from "./actions";
import { StoreForm, UserForm } from "./forms";

export default async function SettingsPage() {
  await requireSuperAdmin();
  const [stores, users] = await Promise.all([
    prisma.store.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { store: { select: { name: true } } } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Administration" title="Paramètres" description="Magasins et utilisateurs (Super Admin)." />

      <Card>
        <CardHeader>
          <CardTitle>Magasins</CardTitle>
          <CardDescription>Un magasin désactivé disparaît pour les Masters ; son historique est conservé.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StoreForm />
          <Table>
            <THead>
              <TR>
                <TH>Nom</TH>
                <TH>Code</TH>
                <TH>Ville</TH>
                <TH>Statut</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {stores.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <form action={renameStoreAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <Input name="name" defaultValue={s.name} className="w-56" />
                      <Button type="submit" size="sm" variant="outline">
                        Renommer
                      </Button>
                    </form>
                  </TD>
                  <TD>{s.code}</TD>
                  <TD>{s.city ?? "—"}</TD>
                  <TD>
                    <Badge variant={s.active ? "default" : "muted"}>{s.active ? "Actif" : "Inactif"}</Badge>
                  </TD>
                  <TD className="text-right">
                    <form action={toggleStoreAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        {s.active ? "Désactiver" : "Réactiver"}
                      </Button>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Utilisateurs</CardTitle>
          <CardDescription>Trois rôles : Super Admin, Master Opérations E-commerce, Master Magasin.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <UserForm stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
          <Table>
            <THead>
              <TR>
                <TH>Nom</TH>
                <TH>E-mail</TH>
                <TH>Rôle</TH>
                <TH>Magasin</TH>
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.name}</TD>
                  <TD>{u.email}</TD>
                  <TD>{ROLE_LABELS[u.role]}</TD>
                  <TD>{u.store?.name ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
