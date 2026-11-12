import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function fmt(n: number): string {
  return nf.format(n);
}

/** Durée en minutes lisible : « 1 h 12 » ou « 45 min ». */
export function fmtMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  OPS_MASTER: "Master Opérations E-commerce",
  STORE_MASTER: "Master Magasin",
} as const;
