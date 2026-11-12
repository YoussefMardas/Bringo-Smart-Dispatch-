"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label, Select } from "@/components/ui/input";
import { formatDateFr, formatSlot, type SlotOption } from "@/lib/slots";

/** Sélection de la date et du créneau parmi ceux du fichier importé (synchronisée avec l'URL). */
export function SlotPicker({ options, date, slot }: { options: SlotOption[]; date: string; slot: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const dates = [...new Set(options.map((o) => o.date))];
  const slots = options.filter((o) => o.date === date);

  const go = (nextDate: string, nextSlot: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("date", nextDate);
    next.set("slot", nextSlot);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="slot-date">Date</Label>
        <Select
          id="slot-date"
          value={date}
          onChange={(e) => go(e.target.value, options.find((o) => o.date === e.target.value)!.slot)}
          className="w-44"
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatDateFr(d)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="slot-range">Créneau</Label>
        <Select id="slot-range" value={slot} onChange={(e) => go(date, e.target.value)} className="w-52">
          {slots.map((o) => (
            <option key={o.slot} value={o.slot}>
              {formatSlot(o.slot)} ({o.orders})
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
