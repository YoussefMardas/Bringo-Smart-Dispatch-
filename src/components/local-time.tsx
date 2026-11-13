"use client";

import { useEffect, useState } from "react";

/**
 * Date et heure formatées dans le navigateur (fuseau Africa/Casablanca).
 * Le serveur et le premier rendu client affichent « … » : plus d'erreur d'hydratation, et l'heure est celle du
 * navigateur, dont les règles de fuseau (Maroc : UTC+1 hors ramadan) sont à jour, contrairement au runtime serveur.
 */
export function LocalTime({ iso, timeStyle = "medium" }: { iso: string; timeStyle?: "short" | "medium" }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle, timeZone: "Africa/Casablanca" }).format(new Date(iso)));
  }, [iso, timeStyle]);
  return <time dateTime={iso}>{text ?? "…"}</time>;
}
