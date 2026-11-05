"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Database, History, KeyRound, LayoutDashboard, LogOut, Settings, Shuffle, Store } from "lucide-react";
import { cn, ROLE_LABELS } from "@/lib/utils";
import { usePortalBase } from "@/lib/use-portal";
import { logoutAction } from "@/app/login/actions";

export interface SidebarStore {
  id: string;
  name: string;
}

interface SidebarProps {
  user: { name: string; role: keyof typeof ROLE_LABELS };
  /** Magasins issus de la colonne Store du fichier importé (liste mise à jour à chaque import). */
  stores: SidebarStore[];
}

const SECTIONS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "distribution", label: "Dispatch", icon: Shuffle },
  { key: "history", label: "Historique", icon: History },
] as const;

export function Sidebar({ user, stores }: SidebarProps) {
  const base = usePortalBase();
  const pathname = usePathname().slice(base.length) || "/";
  const [first, section] = pathname.split("/").filter(Boolean);
  const currentId = stores.find((s) => s.id === first)?.id ?? null;
  const currentSection = SECTIONS.some((s) => s.key === section) ? section : "dashboard";
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const canManage = user.role === "SUPER_ADMIN" || user.role === "OPS_MASTER";

  const item = (active: boolean) =>
    cn(
      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all duration-200",
      active ? "bg-white/[0.07] font-medium text-white" : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-white",
    );
  const bar = (active: boolean) => (
    <span
      className={cn(
        "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
      )}
    />
  );

  return (
    <aside className="sticky top-0 flex h-screen w-[17rem] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-6 pb-6 pt-7">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#8a6a35] font-display text-lg font-medium text-white shadow-lg shadow-black/30">
          B
        </span>
        <div className="leading-tight">
          <p className="font-display text-[17px] font-light tracking-wide text-white">Bringo</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60">Smart Dispatch</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {canManage && (
          <>
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/40">Pilotage</p>
            <Link href={`${base}/import`} className={item(pathname.startsWith("/import"))}>
              {bar(pathname.startsWith("/import"))}
              <Database size={15} /> Import des données
            </Link>
            <Link href={`${base}/accounts`} className={item(pathname.startsWith("/accounts"))}>
              {bar(pathname.startsWith("/accounts"))}
              <KeyRound size={15} /> Comptes magasins
            </Link>
          </>
        )}

        <p className="px-3 pb-1.5 pt-6 text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/40">Magasins</p>
        {stores.length === 0 && (
          <p className="px-3 py-1.5 text-xs leading-relaxed text-sidebar-foreground/55">
            {canManage ? "Importez un fichier .xlsm pour afficher les magasins." : "Aucune donnée disponible."}
          </p>
        )}

        {stores.map((s) => {
          const isCurrent = s.id === currentId;
          const expanded = opened[s.id] ?? isCurrent;
          return (
            <div key={s.id}>
              <div className="flex items-center">
                <Link
                  href={`${base}/${s.id}/${currentSection}`}
                  className={cn(item(false), "min-w-0 flex-1", isCurrent && "bg-white/[0.07] font-medium text-white")}
                >
                  {bar(isCurrent)}
                  <Store size={15} className="shrink-0" />
                  <span className="truncate">{s.name}</span>
                </Link>
                <button
                  type="button"
                  aria-label={expanded ? "Replier" : "Déplier"}
                  onClick={() => setOpened((o) => ({ ...o, [s.id]: !expanded }))}
                  className="ml-0.5 rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              </div>
              {expanded && (
                <ul className="animate-fade my-0.5 ml-[1.15rem] space-y-0.5 border-l border-white/10 pl-2.5">
                  {SECTIONS.map(({ key, label, icon: Icon }) => {
                    const active = isCurrent && currentSection === key;
                    return (
                      <li key={key}>
                        <Link href={`${base}/${s.id}/${key}`} className={cn(item(active), "py-1.5 text-xs")}>
                          <Icon size={13} /> {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {user.role === "SUPER_ADMIN" && (
          <>
            <p className="px-3 pb-1.5 pt-6 text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/40">Administration</p>
            <Link href={`${base}/settings`} className={item(pathname.startsWith("/settings"))}>
              {bar(pathname.startsWith("/settings"))}
              <Settings size={15} /> Paramètres
            </Link>
          </>
        )}
      </nav>

      <div className="border-t border-white/[0.07] p-4">
        <Link href={`${base}/account`} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/[0.05]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-medium text-white">{user.name}</span>
            <span className="block truncate text-[11px] text-sidebar-foreground/60">{ROLE_LABELS[user.role]}</span>
          </span>
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/70 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <LogOut size={13} /> Se déconnecter
          </button>
        </form>
      </div>
    </aside>
  );
}
