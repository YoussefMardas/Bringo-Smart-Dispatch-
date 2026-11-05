import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlotOptions, resolveSelection } from "./slots";

const rows = [
  { date: "2026-11-04", slot: "10:00-12:00", orders: 5 },
  { date: "2026-11-04", slot: "14:00-16:00", orders: 3 },
  { date: "2026-11-04", slot: "08:00-10:00", orders: 2 },
  { date: "2026-11-05", slot: "10:00-12:00", orders: 4 },
];

test("chaque jour expose tous les créneaux connus du magasin (triés), y compris vides", () => {
  const o = buildSlotOptions(rows, "2026-11-05");
  const today = o.filter((x) => x.date === "2026-11-05");
  assert.deepEqual(today.map((x) => x.slot), ["08:00-10:00", "10:00-12:00", "14:00-16:00"]);
  assert.deepEqual(today.map((x) => x.orders), [0, 4, 0]);
});

test("aujourd'hui est proposé même sans donnée ; un nouveau créneau apparaît seul", () => {
  const o = buildSlotOptions([...rows, { date: "2026-11-05", slot: "18:00-20:00", orders: 1 }], "2026-11-06");
  assert.ok(o.some((x) => x.date === "2026-11-06" && x.slot === "18:00-20:00"));
  assert.ok(o.some((x) => x.date === "2026-11-04" && x.slot === "18:00-20:00"));
  assert.deepEqual(buildSlotOptions([], "2026-11-05"), []);
});

test("sélection par défaut : aujourd'hui garni, sinon le jour le plus récent garni ; sélection explicite respectée", () => {
  const o = buildSlotOptions(rows, "2026-11-05");
  assert.deepEqual(resolveSelection(o, {}, "2026-11-05"), { date: "2026-11-05", slot: "10:00-12:00" });
  assert.deepEqual(resolveSelection(o, {}, "2026-11-09"), { date: "2026-11-05", slot: "10:00-12:00" });
  assert.deepEqual(resolveSelection(o, { date: "2026-11-05", slot: "14:00-16:00" }, "2026-11-05"), { date: "2026-11-05", slot: "14:00-16:00" });
  assert.deepEqual(resolveSelection(o, { date: "2026-11-04" }, "2026-11-05"), { date: "2026-11-04", slot: "08:00-10:00" });
  assert.deepEqual(resolveSelection([], {}, "2026-11-05"), { date: "2026-11-05", slot: null });
});
