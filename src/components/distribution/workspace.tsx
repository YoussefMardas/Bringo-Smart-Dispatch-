"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  DEFAULT_MIN_ASSIST_CHUNK,
  distributeOrders,
  type DistributionResult,
  type OrderInput,
} from "@/lib/distribution";
import { MAX_ORDERS_PER_PICKER } from "@/lib/rules";
import { formatSlot } from "@/lib/slots";
import { usePortalBase } from "@/lib/use-portal";
import { fmt } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ResultView } from "@/components/distribution/result-view";
import {
  deleteOrderAction,
  saveDistributionAction,
  setPickersAction,
  updateOrderAction,
} from "@/app/(app)/[storeId]/distribution/actions";

interface WorkspaceProps {
  storeId: string;
  storeName: string;
  date: string;
  slot: string;
  initialPickers: number;
  orders: OrderInput[];
}

type Outcome = { ok: true } | { ok: false; error: string };

export function DistributionWorkspace({ storeId, storeName, date, slot, initialPickers, orders }: WorkspaceProps) {
  const base = usePortalBase();
  const slotRef = { storeId, date, slot };
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Édition d'une commande importée (pas d'ajout manuel : les données viennent du fichier .xlsm)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRef, setDraftRef] = useState("");
  const [draftArticles, setDraftArticles] = useState("");

  // Paramètres
  const [pickersInput, setPickersInput] = useState(initialPickers > 0 ? String(initialPickers) : "");
  const [chunkInput, setChunkInput] = useState(String(DEFAULT_MIN_ASSIST_CHUNK));
  const [minutesInput, setMinutesInput] = useState("1");

  // Résultat
  const [result, setResult] = useState<DistributionResult | null>(null);
  const [generatedFor, setGeneratedFor] = useState<string>("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const totalArticles = orders.reduce((s, o) => s + o.articles, 0);
  const pickers = Number(pickersInput);
  const chunk = chunkInput.trim() === "" ? DEFAULT_MIN_ASSIST_CHUNK : Number(chunkInput);
  const minutesPerArticle = Number(minutesInput) > 0 ? Number(minutesInput) : 1;
  const signature = JSON.stringify([orders.map((o) => [o.id, o.articles]), pickers, chunk]);
  const stale = result !== null && generatedFor !== signature;

  const run = (fn: () => Promise<Outcome>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else onOk?.();
    });

  // --- Commandes ---------------------------------------------------------

  const saveEdit = (id: string) =>
    run(
      () => updateOrderAction({ storeId, orderId: id, reference: draftRef, articles: Number(draftArticles) }),
      () => setEditingId(null),
    );

  // --- Distribution ------------------------------------------------------

  const generate = () => {
    if (!Number.isInteger(pickers) || pickers < 1) return setError("Saisissez un nombre de pickers (entier ≥ 1).");
    if (orders.length === 0) return setError("Aucune commande à distribuer sur ce créneau.");
    if (!Number.isFinite(chunk) || chunk < 0) return setError("Le seuil d'assistance doit être un nombre positif.");
    if (orders.length > pickers * MAX_ORDERS_PER_PICKER) {
      return setError(
        `${orders.length} commandes à répartir : avec ${MAX_ORDERS_PER_PICKER} commandes maximum par picker, il faut au moins ${Math.ceil(
          orders.length / MAX_ORDERS_PER_PICKER,
        )} pickers.`,
      );
    }
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const saved = await setPickersAction({ ...slotRef, pickers });
      if (!saved.ok) return setError(saved.error);
      try {
        setResult(distributeOrders(orders, { pickers, minAssistChunk: chunk, maxOrdersPerPicker: MAX_ORDERS_PER_PICKER }));
        setGeneratedFor(signature);
        setSavedId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur de calcul.");
      }
    });
  };

  const save = () => {
    if (!result) return;
    startTransition(async () => {
      setError(null);
      const r = await saveDistributionAction({
        ...slotRef,
        assignment: result.pickers.map((p) => p.orderIds),
        strategy: result.strategy,
        minAssistChunk: chunk,
        minutesPerArticle,
      });
      if (!r.ok) return setError(r.error);
      setSavedId(r.id);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {(error || info) && (
        <div
          className={`rounded-md border px-4 py-2.5 text-sm ${
            error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {error ?? info}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Commandes importées */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Commandes du créneau</CardTitle>
            <CardDescription>
              {orders.length} commande(s) · {fmt(totalArticles)} produits · importées depuis le fichier .xlsm
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Order Number</TH>
                  <TH>Store</TH>
                  <TH>Créneau</TH>
                  <TH className="text-right">Number Of Products</TH>
                  <TH className="w-24" />
                </TR>
              </THead>
              <TBody>
                {orders.map((o) =>
                  editingId === o.id ? (
                    <TR key={o.id}>
                      <TD>
                        <Input value={draftRef} onChange={(e) => setDraftRef(e.target.value)} />
                      </TD>
                      <TD>{storeName}</TD>
                      <TD>{formatSlot(slot)}</TD>
                      <TD>
                        <Input
                          type="number"
                          min={1}
                          value={draftArticles}
                          onChange={(e) => setDraftArticles(e.target.value)}
                          className="ml-auto w-24 text-right"
                        />
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" disabled={pending} onClick={() => saveEdit(o.id)} aria-label="Valider">
                            <Check size={15} />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label="Annuler">
                            <X size={15} />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ) : (
                    <TR key={o.id}>
                      <TD className="font-medium">{o.reference}</TD>
                      <TD>{storeName}</TD>
                      <TD>{formatSlot(slot)}</TD>
                      <TD className="text-right tabular-nums">{o.articles}</TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Modifier"
                            onClick={() => {
                              setEditingId(o.id);
                              setDraftRef(o.reference);
                              setDraftArticles(String(o.articles));
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Supprimer"
                            disabled={pending}
                            onClick={() => run(() => deleteOrderAction({ storeId, orderId: o.id }))}
                          >
                            <Trash2 size={14} className="text-destructive" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ),
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pickers et paramètres */}
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Pickers disponibles</CardTitle>
            <CardDescription>
              Maximum {MAX_ORDERS_PER_PICKER} commandes par picker, soit au moins {Math.max(1, Math.ceil(orders.length / MAX_ORDERS_PER_PICKER))} pickers pour ce créneau.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pickers">Nombre de pickers</Label>
              <Input
                id="pickers"
                type="number"
                min={1}
                value={pickersInput}
                onChange={(e) => setPickersInput(e.target.value)}
              />
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Paramètres avancés</summary>
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="chunk">Seuil minimal d'assistance (articles)</Label>
                  <Input id="chunk" type="number" min={0} value={chunkInput} onChange={(e) => setChunkInput(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Un picker n'en rejoint un autre que s'il reste au moins ce nombre d'articles à se partager.
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="minutes">Minutes par article (estimation)</Label>
                  <Input
                    id="minutes"
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={minutesInput}
                    onChange={(e) => setMinutesInput(e.target.value)}
                  />
                </div>
              </div>
            </details>
            <Button onClick={generate} disabled={pending || orders.length === 0}>
              {result ? "Régénérer la distribution" : "Générer la distribution"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Résultat de la distribution</h2>
            <Badge variant="muted">Générée automatiquement</Badge>
            {stale && <Badge variant="warning">Données modifiées : régénérez</Badge>}
            <div className="ml-auto flex items-center gap-3">
              {savedId && (
                <Link href={`${base}/${storeId}/history/${savedId}`} className="text-sm text-primary underline">
                  Enregistrée — voir dans l'historique
                </Link>
              )}
              <Button variant="outline" onClick={save} disabled={pending || stale || !!savedId}>
                Enregistrer dans l'historique
              </Button>
            </div>
          </div>

          <ResultView result={result} orders={orders} minutesPerArticle={minutesPerArticle} />
        </>
      )}
    </div>
  );
}
