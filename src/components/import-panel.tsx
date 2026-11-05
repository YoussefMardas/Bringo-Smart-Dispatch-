"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, RefreshCw, Trash2, Upload } from "lucide-react";
import { STATUS_LABELS } from "@/lib/order-status";
import { backoffDelay } from "@/lib/retry";
import type { CreatedAccount } from "@/lib/accounts";
import { CredentialsPanel } from "@/components/credentials-panel";
import { PageHeader } from "@/components/page-header";
import { parseXlsmRows, summarizeByStore, type ImportedOrder } from "@/lib/xlsm-import";
import { fmt } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { clearDataAction, importChunkAction, recordSyncAction } from "@/app/(app)/import/actions";

const CHUNK = 200;
const WATCH_INTERVAL_MS = 15_000; // le fichier lié est surveillé ; toute modification est synchronisée automatiquement

interface Props {
  current: { id: string; name: string; orders: number }[];
  historyCount: number;
}

interface Parsed {
  sheet: string;
  orders: ImportedOrder[];
  errors: string[];
  headerDetected: boolean;
}

interface Preview extends Parsed {
  fileName: string;
}

// --- File System Access API (Chrome / Edge) : le fichier est relu sans nouvel envoi manuel ---

interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  queryPermission?(o: { mode: "read" }): Promise<string>;
  requestPermission?(o: { mode: "read" }): Promise<string>;
}

const openPicker = () =>
  (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]> }).showOpenFilePicker;

const DB = "bsd-sync";
const STORE = "handles";
const KEY = "source-file";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRun<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const saveHandle = (h: FileHandle) => idbRun("readwrite", (s) => s.put(h, KEY));
const loadHandle = () => idbRun<FileHandle | undefined>("readonly", (s) => s.get(KEY) as IDBRequest<FileHandle | undefined>);
const forgetHandle = () => idbRun("readwrite", (s) => s.delete(KEY));

// --- Lecture et envoi ---

/** Lit le .xlsm : première feuille dont les en-têtes sont reconnus (sinon la première). */
async function readOrders(file: File): Promise<Parsed> {
  const { default: readXlsxFile, readSheetNames } = await import("read-excel-file");
  let best: Parsed | null = null;
  for (const name of await readSheetNames(file)) {
    const rows = (await readXlsxFile(file, { sheet: name })) as unknown[][];
    const res = parseXlsmRows(rows);
    const parsed = { sheet: name, orders: res.orders, errors: res.errors, headerDetected: res.headerDetected };
    if (res.headerDetected && res.orders.length > 0) return parsed;
    best ??= parsed;
  }
  if (!best) throw new Error("Classeur vide.");
  return best;
}

/** Envoie les commandes par lots ; lève une erreur au premier échec (l'import est sans doublon, donc relançable). */
async function pushOrders(orders: ImportedOrder[], onProgress?: (done: number, total: number) => void) {
  // Les jours les plus récents (dont aujourd'hui) partent en premier : un incident sur un lot ancien ne les retarde pas.
  const rows = [...orders]
    .sort((x, y) => y.date.localeCompare(x.date))
    .map((o) => ({ orderNumber: o.orderNumber, store: o.store, slot: o.slot, date: o.date, products: o.products, raw: o.raw }));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const problems: string[] = [];
  const failures: string[] = [];
  const accounts: CreatedAccount[] = [];
  // Un lot en échec n'interrompt pas les suivants ; l'erreur est remontée à la fin (donc relancée automatiquement).
  for (let i = 0; i < rows.length; i += CHUNK) {
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
    const r = await importChunkAction({ rows: rows.slice(i, i + CHUNK) });
    if (!r.ok) {
      failures.push(`${r.error} (lignes ${i + 1}–${Math.min(i + CHUNK, rows.length)})`);
      continue;
    }
    added += r.added;
    updated += r.updated;
    unchanged += r.unchanged;
    skipped += r.skipped;
    problems.push(...r.problems);
    accounts.push(...r.accounts);
  }
  if (failures.length) throw new Error(failures[0] + (failures.length > 1 ? ` + ${failures.length - 1} autre(s) lot(s) en échec` : ""));
  return { added, updated, unchanged, skipped, problems, accounts };
}

const clock = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Casablanca" });

export function ImportPanel({ current, historyCount }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [alsoHistory, setAlsoHistory] = useState(false);
  const [newAccounts, setNewAccounts] = useState<CreatedAccount[]>([]);

  // Synchronisation automatique
  const [handle, setHandle] = useState<FileHandle | null>(null);
  const [syncOn, setSyncOn] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [supportsSync, setSupportsSync] = useState(false);
  const lastModified = useRef(0);
  const busy = useRef(false);
  const failures = useRef(0);
  const nextTry = useRef(0);

  const totalOrders = current.reduce((s, c) => s + c.orders, 0);

  useEffect(() => {
    setSupportsSync(typeof openPicker() === "function");
    loadHandle()
      .then(async (h) => {
        if (!h) return;
        setHandle(h);
        // Autorisation déjà accordée : la surveillance reprend seule, sans clic.
        if ((await h.queryPermission?.({ mode: "read" })) === "granted") {
          setSyncOn(true);
          void syncOnce(h, true);
        }
      })
      .catch(() => undefined);
  }, []);

  /**
   * Une passe de synchronisation automatique : ne réimporte que si le fichier a changé.
   * En cas d'échec, l'état « erreur » est enregistré (visible dans la barre de statut) et une nouvelle tentative
   * est planifiée avec un délai croissant ; la prochaine modification du fichier relance aussi.
   */
  const syncOnce = async (h: FileHandle, force = false) => {
    if (busy.current) return;
    if (!force && Date.now() < nextTry.current) return;
    busy.current = true;
    try {
      const file = await h.getFile();
      if (!force && failures.current === 0 && file.lastModified === lastModified.current) return;
      setSyncStatus("Synchronisation en cours…");
      const parsed = await readOrders(file);
      if (parsed.orders.length === 0) throw new Error(parsed.errors[0] ?? "Aucune commande Hyper valide dans le fichier.");
      const r = await pushOrders(parsed.orders);
      lastModified.current = file.lastModified;
      failures.current = 0;
      setSyncError(null);
      if (r.accounts.length) setNewAccounts((a) => [...r.accounts, ...a]);
      setSyncStatus(`${clock()} — ${r.added} ajoutée(s), ${r.updated} mise(s) à jour, ${r.unchanged} inchangée(s)${r.skipped ? `, ${r.skipped} ignorée(s)` : ""}`);
      await recordSyncAction({ ok: true }).catch(() => undefined);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur de synchronisation.";
      const delay = backoffDelay(failures.current++);
      nextTry.current = Date.now() + delay;
      setSyncError(`${msg} Nouvelle tentative automatique dans ${Math.round(delay / 1000)} s.`);
      setSyncStatus(null);
      await recordSyncAction({ ok: false, error: msg }).catch(() => undefined);
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (!syncOn || !handle) return;
    const id = setInterval(() => void syncOnce(handle), WATCH_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncOn, handle]);

  const connect = async () => {
    setError(null);
    try {
      const [h] = await openPicker()!({
        multiple: false,
        types: [{ description: "Classeur Excel (.xlsm)", accept: { "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"] } }],
      });
      if (!/\.xlsm$/i.test(h.name)) return setError("Choisissez un fichier .xlsm.");
      await saveHandle(h).catch(() => undefined);
      lastModified.current = 0;
      setHandle(h);
      setSyncOn(true);
      void syncOnce(h, true);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError("Impossible de lier ce fichier.");
    }
  };

  const resume = async () => {
    if (!handle) return;
    const granted = (await handle.requestPermission?.({ mode: "read" })) === "granted";
    if (!granted) return setError("Autorisation de lecture refusée : choisissez à nouveau le fichier.");
    setSyncOn(true);
    void syncOnce(handle, true);
  };

  const stopSync = () => {
    setSyncOn(false);
    setHandle(null);
    setSyncStatus(null);
    setSyncError(null);
    failures.current = 0;
    void forgetHandle().catch(() => undefined);
  };

  // --- Import manuel avec aperçu ---

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    setError(null);
    setInfo(null);
    setPreview(null);
    if (!/\.xlsm$/i.test(file.name)) return setError("Format non pris en charge : importez un fichier .xlsm.");
    if (file.size > 25 * 1024 * 1024) return setError("Fichier trop volumineux (25 Mo maximum).");
    setProgress("Lecture du fichier…");
    try {
      const parsed = await readOrders(file);
      if (parsed.orders.length === 0) return setError(parsed.errors[0] ?? "Aucune commande Hyper valide dans ce fichier.");
      setPreview({ ...parsed, fileName: file.name });
    } catch {
      setError("Impossible de lire ce fichier. Vérifiez qu'il s'agit d'un classeur .xlsm valide.");
    } finally {
      setProgress(null);
    }
  };

  const runImport = () => {
    if (!preview) return;
    startTransition(async () => {
      setError(null);
      setInfo(null);
      try {
        const r = await pushOrders(preview.orders, (done, total) => setProgress(`Import en cours… ${done} / ${total}`));
        setPreview(null);
        if (r.accounts.length) setNewAccounts((a) => [...r.accounts, ...a]);
        setInfo(`Import terminé : ${r.added} ajoutée(s), ${r.updated} mise(s) à jour, ${r.unchanged} inchangée(s).${r.skipped ? ` ${r.skipped} ligne(s) ignorée(s) : ${r.problems[0]}` : ""}${r.accounts.length ? ` ${r.accounts.length} compte(s) magasin créé(s).` : ""}`);
        await recordSyncAction({ ok: true }).catch(() => undefined);
        router.refresh(); // met à jour la liste des magasins de la sidebar
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur d'import.");
      } finally {
        setProgress(null);
      }
    });
  };

  const runClear = () =>
    startTransition(async () => {
      setError(null);
      const r = await clearDataAction({ alsoHistory });
      if (!r.ok) return setError(r.error);
      setConfirmClear(false);
      setPreview(null);
      if (syncOn) stopSync(); // sinon la prochaine passe réimporterait les données supprimées
      setInfo(
        `Données supprimées : ${r.orders} commande(s)` +
          (alsoHistory ? ` et ${r.history} distribution(s) d'historique.` : ".") +
          (syncOn ? " La synchronisation automatique a été arrêtée." : ""),
      );
      router.refresh();
    });

  const byStore = preview ? summarizeByStore(preview.orders) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Pilotage"
        title="Import des données"
        description={<>Fichier source .xlsm — <strong>Hyper magasins uniquement</strong>. Chaque ligne est rattachée automatiquement au magasin de la colonne <strong>Store</strong> ; chaque magasin ne voit que ses propres commandes.</>}
      />

      <CredentialsPanel accounts={newAccounts} title={`${newAccounts.length} compte(s) magasin créé(s) automatiquement`} />

      {(error || info) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {error ?? info}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Données actuelles</CardTitle>
            <CardDescription>
              {totalOrders === 0
                ? "Aucune donnée importée."
                : `${fmt(totalOrders)} commande(s) dans ${current.length} magasin(s).`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".xlsm" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button disabled={pending || !!progress} onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Importer un fichier .xlsm
            </Button>
            <Button
              variant="destructive"
              disabled={pending || (totalOrders === 0 && historyCount === 0)}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={14} /> Clear Data
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {progress && <p className="text-sm text-muted-foreground">{progress}</p>}

          {confirmClear && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Confirmer la suppression des données importées ?</p>
              <p className="mt-1 text-destructive/90">
                {fmt(totalOrders)} commande(s) et les nombres de pickers saisis seront supprimés. Cette action est irréversible.
                Les magasins et les comptes sont conservés.
              </p>
              <label className="mt-3 flex items-center gap-2 text-destructive">
                <input type="checkbox" checked={alsoHistory} onChange={(e) => setAlsoHistory(e.target.checked)} />
                Supprimer aussi l'historique des distributions ({historyCount})
              </label>
              <div className="mt-3 flex gap-2">
                <Button variant="destructive" size="sm" disabled={pending} onClick={runClear}>
                  Oui, tout supprimer
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {current.length > 0 && (
            <Table>
              <THead>
                <TR>
                  <TH>Magasin</TH>
                  <TH className="text-right">Commandes</TH>
                </TR>
              </THead>
              <TBody>
                {current.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-right tabular-nums">{c.orders}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw size={16} /> Synchronisation automatique
          </CardTitle>
          <CardDescription>
            Liez le fichier une fois : toute modification enregistrée est détectée et synchronisée automatiquement, avec
            nouvelle tentative en cas d'échec. Fonctionne tant que cette page reste ouverte (Chrome ou Edge).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!supportsSync ? (
            <p className="text-muted-foreground">
              Ce navigateur ne permet pas de relire un fichier local automatiquement. Utilisez Chrome ou Edge, ou l'import manuel.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                {syncOn && handle ? (
                  <>
                    <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                      Active — {handle.name}
                    </span>
                    <Button size="sm" variant="ghost" onClick={stopSync}>
                      Arrêter
                    </Button>
                  </>
                ) : handle ? (
                  <>
                    <span className="text-muted-foreground">Fichier lié : {handle.name} (en pause)</span>
                    <Button size="sm" onClick={resume}>
                      Reprendre la synchronisation
                    </Button>
                    <Button size="sm" variant="ghost" onClick={stopSync}>
                      Délier
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={connect}>
                    Lier un fichier .xlsm et synchroniser
                  </Button>
                )}
              </div>
              {syncStatus && <p className="text-muted-foreground">Dernière synchronisation : {syncStatus}</p>}
              {syncError && <p className="text-destructive">{syncError}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet size={16} /> Aperçu — {preview.fileName}
            </CardTitle>
            <CardDescription>
              Feuille « {preview.sheet} » · {preview.orders.length} commande(s) Hyper valides ·{" "}
              {preview.headerDetected ? "en-têtes reconnus" : "lecture par position des colonnes"}
              <br />
              {(["OK", "LATE", "CANCELLED", "OTHER"] as const).map((k) => `${STATUS_LABELS[k]} : ${preview.orders.filter((o) => o.status === k).length}`).join(" · ")}
              {" "}— seules les commandes OK et Retard seront dispatchées.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <THead>
                <TR>
                  <TH>Store</TH>
                  <TH className="text-right">Commandes</TH>
                  <TH className="text-right">Produits</TH>
                </TR>
              </THead>
              <TBody>
                {byStore.map((s) => (
                  <TR key={s.store}>
                    <TD className="font-medium">{s.store}</TD>
                    <TD className="text-right tabular-nums">{s.orders}</TD>
                    <TD className="text-right tabular-nums">{fmt(s.products)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {preview.errors.length > 0 && (
              <details className="text-xs text-muted-foreground" open={preview.errors[0].includes("non Hyper")}>
                <summary className="cursor-pointer">{preview.errors.length} avertissement(s)</summary>
                <ul className="mt-1 list-disc pl-5">
                  {preview.errors.slice(0, 30).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-muted-foreground">
              Les commandes déjà présentes (même Store + Order Number) sont mises à jour, les nouvelles sont ajoutées.
            </p>
            <div className="flex gap-2">
              <Button onClick={runImport} disabled={pending}>
                Importer {preview.orders.length} commande(s)
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={pending}>
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
