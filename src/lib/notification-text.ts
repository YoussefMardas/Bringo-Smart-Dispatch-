export interface PickerChange {
  storeName: string;
  actorName: string;
  before: number; // 0 = non renseigné
  after: number;
  /** AAAA-MM-JJ */
  date: string;
  /** Créneau déjà formaté (ex. « 10:00 – 12:00 »). */
  slotLabel: string;
}

const dateFr = (iso: string) => iso.split("-").reverse().join("/");

/** Texte de la notification envoyée au Master Opérations quand un Master Magasin modifie les pickers. */
export function pickerChangeText(c: PickerChange): { title: string; message: string } {
  const change =
    c.before > 0
      ? `de ${c.before} à ${c.after} picker${c.after > 1 ? "s" : ""} (${c.after > c.before ? "+" : "−"}${Math.abs(c.after - c.before)})`
      : `défini à ${c.after} picker${c.after > 1 ? "s" : ""} (auparavant non renseigné)`;
  return {
    title: `Pickers modifiés — ${c.storeName}`,
    message: `${c.actorName} a modifié le nombre de pickers : ${change}. Créneau ${c.slotLabel}, le ${dateFr(c.date)}.`,
  };
}
