"use client";

import { Download, KeyRound } from "lucide-react";
import type { CreatedAccount } from "@/lib/accounts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Identifiants fraîchement générés : visibles une seule fois (seul le hash est conservé). */
export function CredentialsPanel({ accounts, title }: { accounts: CreatedAccount[]; title?: string }) {
  if (accounts.length === 0) return null;

  const download = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["Magasin;E-mail;Mot de passe temporaire", ...accounts.map((a) => [a.storeName, a.email, a.password].map(esc).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "comptes-magasins.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="animate-rise border-accent/40 bg-accent/[0.04] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">
            <KeyRound size={16} />
          </span>
          <div>
            <p className="font-display text-lg">{title ?? `${accounts.length} compte(s) généré(s)`}</p>
            <p className="text-xs text-muted-foreground">Mots de passe temporaires affichés une seule fois : téléchargez la liste maintenant.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={download}>
          <Download size={14} /> Télécharger (CSV)
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Magasin</th>
              <th className="px-4 py-2.5 font-medium">E-mail</th>
              <th className="px-4 py-2.5 font-medium">Mot de passe temporaire</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.email} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5">{a.storeName}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.email}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
