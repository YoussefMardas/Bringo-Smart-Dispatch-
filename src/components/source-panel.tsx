"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Trash2, TriangleAlert } from "lucide-react";
import { fmt } from "@/lib/utils";
import type { SyncSummary } from "@/lib/sync-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { clearDataAction } from "@/app/(app)/import/actions";

interface Props {
  configured: boolean;
  current: { id: string; name: string; orders: number }[];
  historyCount: number;
  sync: {
    status: string;
    lastSuccessAt: string | null;
    lastError: string | null;
    failures: number;
    nextAttemptAt: string | null;
    summary: SyncSummary | null;
  };
}

export function SourcePanel({ configured, current, historyCount, sync }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [alsoHistory, setAlsoHistory] = useState(false);
  const total = current.reduce((s, c) => s + c.orders, 0);
  const s = sync.summary;

  const runClear = () =>
    start(async () => {
      setError(null);
      const r = await clearDataAction({ alsoHistory });
      if (!r.ok) return setError(r.error);
      setConfirmClear(false);
      setInfo(`Données supprimées : ${r.orders} commande(s)${alsoHistory ? ` et ${r.history} distribution(s) d'historique` : ""}. La source les recharge à la prochaine synchronisation (moins d'une minute).`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Pilotage"
        title="Source des données"
        description={<>Les commandes sont lues <strong>directement depuis Redash</strong>, en continu et sans fichier Excel. Seuls les <strong>Hyper magasins</strong> sont conservés ; chaque ligne va au magasin de sa colonne <strong>Store</strong>.</>}
      />

      {(error || info) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/10 text-success"}`}>
          {error ?? info}
        </div>
      )}

      {!configured && (
        <div className="flex gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-[#7a5d2e]">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <p>
            Source non configurée : ajoutez la variable d'environnement <code className="rounded bg-white/60 px-1">REDASH_CSV_URL</code> (lien
            du CSV Redash) dans <code className="rounded bg-white/60 px-1">.env</code> / Vercel, puis redémarrez. Aucune donnée ne sera
            synchronisée tant qu'elle est absente.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database size={16} /> Synchronisation automatique
          </CardTitle>
          <CardDescription>Lecture du lien toutes les minutes, en arrière-plan ; nouvelle tentative automatique en cas d'échec.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            {sync.lastSuccessAt ? <>Dernière synchronisation réussie : <strong><LocalTime iso={sync.lastSuccessAt} /></strong></> : "Aucune synchronisation réussie pour le moment."}
          </p>
          {sync.status === "error" && (
            <p className="rounded-lg bg-destructive/5 px-3 py-2 text-destructive">
              Échec (tentative {sync.failures}) : {sync.lastError}
              {sync.nextAttemptAt && <> — nouvelle tentative automatique vers <LocalTime iso={sync.nextAttemptAt} />.</>}
            </p>
          )}
          {s && (
            <ul className="grid grid-cols-2 gap-x-8 gap-y-1 text-muted-foreground sm:grid-cols-3">
              <li>Lignes lues : <strong className="text-foreground">{fmt(s.rowsRead)}</strong></li>
              <li>Commandes Hyper : <strong className="text-foreground">{fmt(s.hyperOrders)}</strong></li>
              <li>Autres magasins ignorés : <strong className="text-foreground">{fmt(s.skippedNonHyper)}</strong></li>
              <li>Ajoutées : <strong className="text-foreground">{s.added}</strong></li>
              <li>Mises à jour : <strong className="text-foreground">{s.updated}</strong></li>
              <li>Inchangées : <strong className="text-foreground">{fmt(s.unchanged)}</strong></li>
            </ul>
          )}
          {s && s.skipped > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{s.skipped} ligne(s) Hyper ignorée(s)</summary>
              <ul className="mt-1 list-disc pl-5">{s.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Données actuelles</CardTitle>
            <CardDescription>{total === 0 ? "Aucune commande synchronisée." : `${fmt(total)} commande(s) dans ${current.length} magasin(s).`}</CardDescription>
          </div>
          <Button variant="destructive" disabled={pending || (total === 0 && historyCount === 0)} onClick={() => setConfirmClear(true)}>
            <Trash2 size={14} /> Clear Data
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {confirmClear && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Confirmer la suppression des données synchronisées ?</p>
              <p className="mt-1 text-destructive/90">
                {fmt(total)} commande(s) et les nombres de pickers saisis seront supprimés ; les commandes présentes dans la source seront rechargées à la
                prochaine synchronisation. Les magasins et les comptes sont conservés.
              </p>
              <label className="mt-3 flex items-center gap-2 text-destructive">
                <input type="checkbox" checked={alsoHistory} onChange={(e) => setAlsoHistory(e.target.checked)} />
                Supprimer aussi l'historique des distributions ({historyCount})
              </label>
              <div className="mt-3 flex gap-2">
                <Button variant="destructive" size="sm" disabled={pending} onClick={runClear}>Oui, tout supprimer</Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>Annuler</Button>
              </div>
            </div>
          )}
          {current.length > 0 && (
            <Table>
              <THead>
                <TR><TH>Magasin</TH><TH className="text-right">Commandes</TH></TR>
              </THead>
              <TBody>
                {current.map((c) => (
                  <TR key={c.id}><TD className="font-medium">{c.name}</TD><TD className="text-right tabular-nums">{c.orders}</TD></TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
