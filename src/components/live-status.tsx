"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, RefreshCw, TriangleAlert, X } from "lucide-react";
import { backoffDelay } from "@/lib/retry";
import { cn } from "@/lib/utils";
import { usePortalBase } from "@/lib/use-portal";
import { markAllReadAction } from "@/app/(app)/notifications/actions";

const POLL_MS = 10_000;

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

interface Payload {
  version: number;
  lastSuccessAt: string | null;
  lastStatus: "idle" | "ok" | "error";
  lastError: string | null;
  unread: number;
  latest: NotificationItem[];
}

const fullDateTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Africa/Casablanca",
  })
    .format(new Date(iso))
    .replace(",", " à");

const shortTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Casablanca" }).format(new Date(iso));

/**
 * Synchronisation en arrière-plan + notifications, dans la barre supérieure.
 * - interroge /api/sync toutes les 10 s (en pause quand l'onglet est masqué, reprise immédiate au retour) ;
 * - quand `version` change (import, modification, autre compte), rafraîchit la page automatiquement ;
 * - en cas d'échec réseau/serveur, relance seule avec un délai croissant (5 s → 60 s).
 */
export function LiveStatus({ showBell }: { showBell: boolean }) {
  const router = useRouter();
  const base = usePortalBase();
  const [data, setData] = useState<Payload | null>(null);
  const [conn, setConn] = useState<"loading" | "ok" | "retrying">("loading");
  const [retryIn, setRetryIn] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const version = useRef<number | null>(null);
  const unread = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;

    const run = async () => {
      if (stopped) return;
      if (document.hidden) {
        timer = setTimeout(run, POLL_MS);
        return;
      }
      try {
        const res = await fetch(`${base}/api/sync`, { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = `${base}/login`;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const p = (await res.json()) as Payload;
        attempt = 0;
        setConn("ok");
        setData(p);
        if (version.current !== null && p.version !== version.current) router.refresh(); // données à jour sans action
        version.current = p.version;
        if (unread.current !== null && p.unread > unread.current && p.latest[0]) {
          const fresh = p.latest.filter((n) => !n.read).slice(0, p.unread - unread.current);
          setToasts((t) => [...fresh, ...t].slice(0, 3));
        }
        unread.current = p.unread;
        timer = setTimeout(run, POLL_MS);
      } catch {
        const delay = backoffDelay(attempt++);
        setConn("retrying");
        setRetryIn(Math.round(delay / 1000));
        timer = setTimeout(run, delay);
      }
    };

    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void run();
      }
    };
    void run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [router, base]);

  // Les toasts disparaissent seuls.
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setTimeout(() => setToasts((t) => t.slice(0, -1)), 7000);
    return () => clearTimeout(id);
  }, [toasts]);

  useEffect(() => {
    const close = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const failed = data?.lastStatus === "error";
  const state =
    conn === "retrying"
      ? { tone: "bad", label: "Connexion perdue", sub: `Nouvelle tentative dans ${retryIn} s` }
      : conn === "loading"
        ? { tone: "wait", label: "Synchronisation…", sub: "" }
        : failed
          ? { tone: "warn", label: "Échec de la dernière synchronisation", sub: "Nouvelle tentative automatique en cours" }
          : data?.lastSuccessAt
            ? { tone: "ok", label: "À jour", sub: `Dernière synchro réussie : ${fullDateTime(data.lastSuccessAt)}` }
            : { tone: "idle", label: "En attente de données", sub: "Aucune synchronisation effectuée" };

  const dot = {
    ok: "bg-success text-success",
    warn: "bg-accent text-accent pulse-dot",
    bad: "bg-destructive text-destructive pulse-dot",
    wait: "bg-muted-foreground text-muted-foreground pulse-dot",
    idle: "bg-muted-foreground/50 text-muted-foreground",
  }[state.tone];

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-3 rounded-full border border-border/80 bg-card/80 py-1.5 pl-3 pr-4 shadow-xs"
        title={failed && data?.lastError ? data.lastError : state.sub}
        aria-live="polite"
      >
        {state.tone === "wait" ? (
          <RefreshCw size={13} className="animate-spin text-muted-foreground" />
        ) : state.tone === "warn" || state.tone === "bad" ? (
          <TriangleAlert size={13} className={state.tone === "bad" ? "text-destructive" : "text-accent"} />
        ) : (
          <span className={cn("h-2 w-2 rounded-full", dot)} />
        )}
        <span className="leading-tight">
          <span className="block text-xs font-medium">{state.label}</span>
          {state.sub && <span className="block text-[11px] text-muted-foreground">{state.sub}</span>}
        </span>
      </div>

      {showBell && (
        <div ref={panel} className="relative">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => setOpen((o) => !o)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card/80 shadow-xs transition-all hover:border-foreground/20 hover:bg-card"
          >
            <Bell size={16} />
            {(data?.unread ?? 0) > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white ring-2 ring-background">
                {data!.unread > 99 ? "99+" : data!.unread}
              </span>
            )}
          </button>
          {open && (
            <div className="animate-toast absolute right-0 top-12 z-50 w-[24rem] overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <p className="font-display text-base">Notifications</p>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={async () => {
                    await markAllReadAction();
                    setData((d) => (d ? { ...d, unread: 0, latest: d.latest.map((n) => ({ ...n, read: true })) } : d));
                    unread.current = 0;
                  }}
                >
                  <Check size={12} /> Tout marquer comme lu
                </button>
              </div>
              <ul className="max-h-96 divide-y divide-border/70 overflow-y-auto">
                {(data?.latest ?? []).length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">Aucune notification.</li>}
                {(data?.latest ?? []).map((n) => (
                  <li key={n.id} className={cn("flex gap-3 px-5 py-3.5", !n.read && "bg-accent/[0.06]")}>
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-snug">{n.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">{shortTime(n.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href={`${base}/notifications`}
                onClick={() => setOpen(false)}
                className="block border-t border-border px-5 py-3 text-center text-xs font-medium text-primary transition-colors hover:bg-muted/60"
              >
                Voir toutes les notifications
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Toasts : une notification reçue apparaît sans action de l'utilisateur */}
      <div className="pointer-events-none fixed right-6 top-20 z-[60] flex w-[22rem] flex-col gap-2">
        {toasts.map((n) => (
          <div key={n.id} className="animate-toast pointer-events-auto rounded-xl border border-border bg-card p-4 shadow-lift">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Bell size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug">{n.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
