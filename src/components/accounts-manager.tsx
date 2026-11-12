"use client";

import { useState, useTransition } from "react";
import { RotateCcw, UserPlus } from "lucide-react";
import { createMissingAccountsAction, resetAccountPasswordAction, resetPendingPasswordsAction } from "@/app/(app)/accounts/actions";
import type { CreatedAccount } from "@/lib/accounts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CredentialsPanel } from "@/components/credentials-panel";

export interface AccountRow {
  storeId: string;
  storeName: string;
  userId: string | null;
  email: string | null;
  mustChangePassword: boolean;
}

export function AccountsManager({ rows }: { rows: AccountRow[] }) {
  const [pending, start] = useTransition();
  const [fresh, setFresh] = useState<CreatedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const missing = rows.filter((r) => !r.userId).length;

  const run = (fn: () => ReturnType<typeof createMissingAccountsAction>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) setFresh((f) => [...r.accounts, ...f]);
      else setError(r.error);
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} magasin(s) Hyper · {rows.length - missing} compte(s) actif(s) · {missing} à créer
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run(resetPendingPasswordsAction)} disabled={pending || !rows.some((r) => r.mustChangePassword)}>
            <RotateCcw size={15} /> Générer les mots de passe temporaires
          </Button>
          <Button onClick={() => run(createMissingAccountsAction)} disabled={pending || missing === 0}>
            <UserPlus size={15} /> Créer les comptes manquants
          </Button>
        </div>
      </div>
      {error && <p className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">{error}</p>}
      <CredentialsPanel accounts={fresh} />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Magasin</th>
              <th className="px-5 py-3 font-medium">E-mail de connexion</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                  Aucun magasin Hyper pour l&apos;instant : les comptes sont créés automatiquement à l&apos;import.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.storeId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                <td className="px-5 py-3 font-medium">{r.storeName}</td>
                <td className="px-5 py-3 font-mono text-xs">{r.email ?? "—"}</td>
                <td className="px-5 py-3">
                  {!r.userId ? <Badge variant="warning">À créer</Badge> : r.mustChangePassword ? <Badge variant="muted">Mot de passe temporaire</Badge> : <Badge variant="success">Actif</Badge>}
                </td>
                <td className="px-5 py-3 text-right">
                  {r.userId && (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => resetAccountPasswordAction(r.userId!))}>
                      <RotateCcw size={13} /> Réinitialiser le mot de passe
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
