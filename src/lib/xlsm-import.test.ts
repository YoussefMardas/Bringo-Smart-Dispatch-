import { test } from "node:test";
import assert from "node:assert/strict";
import { XLSM_COLUMNS, slotFromRow, toClock, isHyperStore, normalizeCreneau, parseXlsmRows, summarizeByStore, toIsoDate } from "./xlsm-import";

test("46 colonnes dans l'ordre du cahier des charges", () => {
  assert.equal(XLSM_COLUMNS.length, 46);
  assert.deepEqual(XLSM_COLUMNS.slice(0, 5), ["Order Number", "Store", "Creneau", "Fraudeur", "Number Of Products"]);
  assert.equal(XLSM_COLUMNS[45], "Maintenant2");
});

const blank = () => Array<unknown>(46).fill(null);
const row = (o: Record<number, unknown>) => Object.assign(blank(), o);

test("lecture par en-têtes (colonnes réordonnées) et conservation des autres colonnes", () => {
  const header = ["Store", "Order Number", "Number Of Products", "Créneau", "Picker Name", "Day Of Delivery"];
  const r = parseXlsmRows([
    header,
    ["Hyper A", "1001", 12, "10h-12h", "Karim", new Date("2026-11-02T00:00:00Z")],
    ["Hyper B", 1002, "7", "12:00 - 14:00", null, "03/11/2026"],
  ]);
  assert.equal(r.headerDetected, true);
  assert.equal(r.orders.length, 2);
  assert.deepEqual(
    { ...r.orders[0], raw: undefined },
    { orderNumber: "1001", store: "Hyper A", slot: "10:00-12:00", date: "2026-11-02", products: 12, raw: undefined, status: "OTHER" },
  );
  assert.equal(r.orders[0].raw["Picker Name"], "Karim");
  assert.equal(r.orders[0].raw["Day Of Delivery"], "2026-11-02T00:00:00.000Z");
  assert.equal(r.orders[1].date, "2026-11-03");
  assert.equal(r.orders[1].orderNumber, "1002");
});

test("lecture positionnelle quand il n'y a pas d'en-tête", () => {
  const r = parseXlsmRows([row({ 0: "A1", 1: "Hyper X", 2: "08:00-10:00", 4: 5, 18: "2026-11-02" })]);
  assert.equal(r.headerDetected, false);
  assert.equal(r.orders.length, 1);
  assert.equal(r.orders[0].store, "Hyper X");
  assert.equal(r.orders[0].raw["Order Date"], "2026-11-02");
});

test("lignes invalides ignorées avec un message, doublons dédupliqués", () => {
  const r = parseXlsmRows([
    ["Order Number", "Store", "Creneau", "Number Of Products", "Order Date"],
    ["1", "Hyper S", "08:00-10:00", 5, "2026-11-02"],
    ["", "Hyper S", "08:00-10:00", 5, "2026-11-02"],
    ["3", "Hyper S", "08:00-10:00", 0, "2026-11-02"],
    ["4", "Hyper S", "08:00-10:00", 5, "n'importe quoi"],
    ["1", "  hyper   s ", "08:00-10:00", 9, "2026-11-02"],
  ]);
  assert.equal(r.orders.length, 1);
  assert.equal(r.orders[0].products, 9); // doublon (magasin comparé sans casse ni espaces) : dernière ligne
  assert.equal(r.duplicates, 1);
  assert.equal(r.errors.filter((e) => e.startsWith("Ligne")).length, 3);
});

test("créneau et dates", () => {
  assert.equal(normalizeCreneau("8h - 10h"), "08:00-10:00");
  assert.equal(normalizeCreneau("Matin"), "Matin");
  assert.equal(normalizeCreneau(""), "Sans créneau");
  assert.equal(toIsoDate(46054), "2026-02-01");
  assert.equal(toIsoDate("15/03/2026 10:30"), "2026-03-15");
  assert.equal(toIsoDate("x"), null);
});

test("résumé par magasin", () => {
  const r = parseXlsmRows([
    ["Order Number", "Store", "Creneau", "Number Of Products", "Day Of Delivery"],
    ["1", "Hyper B", "08:00-10:00", 5, "2026-11-02"],
    ["2", "Hyper A", "08:00-10:00", 7, "2026-11-02"],
    ["3", "Hyper A", "10:00-12:00", 3, "2026-11-02"],
  ]);
  assert.deepEqual(summarizeByStore(r.orders), [
    { store: "Hyper A", orders: 2, products: 10 },
    { store: "Hyper B", orders: 1, products: 5 },
  ]);
});

test("import limité aux Hyper magasins", () => {
  assert.equal(isHyperStore("Hyper Dar Bouazza"), true);
  assert.equal(isHyperStore("  HYPER   Al Mazar"), true);
  assert.equal(isHyperStore("Hypermarché X"), true);
  assert.equal(isHyperStore("Super Hyper"), true);
  assert.equal(isHyperStore("Supermarché Y"), false);
  const r = parseXlsmRows([
    ["Order Number", "Store", "Creneau", "Number Of Products", "Day Of Delivery"],
    ["1", "Hyper A", "08:00-10:00", 5, "2026-11-02"],
    ["2", "Supermarché B", "08:00-10:00", 7, "2026-11-02"],
    ["3", "Express C", "08:00-10:00", 3, "2026-11-02"],
  ]);
  assert.deepEqual(r.orders.map((o) => o.orderNumber), ["1"]);
  assert.equal(r.skippedNonHyper, 2);
  assert.match(r.errors[0], /non Hyper/);
});

test("créneau reconstitué depuis Debut/Fin De Creneau quand « Creneau » est vide ou libre (ex. Maintenant)", () => {
  assert.equal(slotFromRow("Maintenant", new Date("2026-11-05T14:00:00Z"), new Date("2026-11-05T16:00:00Z")), "14:00-16:00");
  assert.equal(slotFromRow("", 0.5, 0.5833333), "12:00-14:00");
  assert.equal(slotFromRow("10h-12h", "x", "y"), "10:00-12:00");
  assert.equal(slotFromRow("", null, null), "Sans créneau");
  assert.equal(toClock("2026-11-05 09:30"), "09:30");
});

test("commande annulée à 0 article conservée ; repli sur Number Of Final Products ; statut calculé", () => {
  const h = ["Order Number", "Store", "Creneau", "Number Of Products", "Status Acceptation", "Number Of Final Products", "Day Of Delivery"];
  const d = "2026-11-05";
  const r = parseXlsmRows([
    h,
    ["C1", "Hyper A", "10h-12h", 0, "Annulée", "", d],
    ["C2", "Hyper A", "10h-12h", 0, "OK", 9, d],
    ["C3", "Hyper A", "10h-12h", 0, "OK", "", d],
    ["C4", "Hyper A", "10h-12h", 4, "Retard", "", d],
  ]);
  const by = Object.fromEntries(r.orders.map((o) => [o.orderNumber, o]));
  assert.equal(by.C1.status, "CANCELLED");
  assert.equal(by.C1.products, 0);
  assert.equal(by.C2.products, 9);
  assert.equal(by.C3, undefined); // OK sans aucun article : ignorée avec avertissement
  assert.equal(by.C4.status, "LATE");
  assert.ok(r.errors.some((e) => e.includes("C3")));
});
