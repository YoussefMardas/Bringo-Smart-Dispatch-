import { test } from "node:test";
import assert from "node:assert/strict";
import { isHyperStore, normalizeCreneau, parseCsv, parseRedashCsv, slotFromRow, toClock, toIsoDate } from "./order-source";

const HEADER =
  "Order Date,Order Number,Store,Status,Day Of Delivery,Debut De Creneau,Fin De Creneau,Number Of Products,Number Of Final Products,Total Amount Paid,Cancel_reason";

test("CSV : guillemets, virgules décimales, champs vides, CRLF, BOM", () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"2146,28","x ""y"""\r\n,,\r\n3,,z');
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "2146,28", 'x "y"'], ["3", "", "z"]]);
});

test("export Redash : Hyper uniquement, créneau Début/Fin, date jj/mm/aa, statuts", () => {
  const csv = [
    HEADER,
    '10/11/26 10:19:29,470043,Hyper Targa,fulfilled,11/11/26,10:00:00,12:00:00,27,23,"1526,08",',
    "10/11/26 10:36:40,470064,Hyper Sidi Maarouf,new,12/11/26,14:00:00,16:00:00,6,7,\"255,60\",",
    "10/11/26 11:00:00,470409,Hyper Targa,cancelled,11/11/26,10:00:00,12:00:00,0,,\"0\",Problème technique",
    "10/11/26 11:00:00,470540,Market Ville Verte,cancelled,11/11/26,,,3,,\"10\",Rupture",
    "10/11/26 11:00:00,470541,Hyper Agadir,new,11/11/26,,,4,,\"10\",",
    "10/11/26 11:00:00,470542,Hyper Agadir,new,11/11/26,10:00:00,12:00:00,,,\"10\",",
  ].join("\n");
  const r = parseRedashCsv(csv);
  assert.equal(r.totalRows, 6);
  assert.equal(r.skippedNonHyper, 1);
  const by = Object.fromEntries(r.orders.map((o) => [o.orderNumber, o]));
  assert.equal(by["470043"].slot, "10:00-12:00");
  assert.equal(by["470043"].date, "2026-11-11");
  assert.equal(by["470043"].products, 27);
  assert.equal(by["470043"].status, "OK");
  assert.equal(by["470064"].date, "2026-11-12");
  assert.equal(by["470064"].status, "OK"); // « new » : à dispatcher
  assert.equal(by["470409"].status, "CANCELLED");
  assert.equal(by["470409"].products, 0);
  assert.equal(by["470541"].slot, "Sans créneau");
  assert.equal(by["470542"], undefined);
  assert.ok(r.errors.some((e) => e.includes("470542")));
  assert.equal(by["470043"].raw["Total Amount Paid"], "1526,08");
});

test("colonnes réordonnées acceptées ; colonne indispensable absente = erreur explicite", () => {
  const r = parseRedashCsv("Store,Order Number,Number Of Products,Day Of Delivery,Debut De Creneau,Fin De Creneau\nHyper A,1,5,11/11/26,08:00:00,10:00:00");
  assert.equal(r.orders[0].slot, "08:00-10:00");
  assert.throws(() => parseRedashCsv("Store,Order Number\nHyper A,1"), /Colonnes manquantes/);
});

test("doublons d'Order Number : dernière ligne conservée", () => {
  const r = parseRedashCsv(`${HEADER}\nx,1,Hyper A,new,11/11/26,10:00:00,12:00:00,5,,1,\nx,1,Hyper A,cancelled,11/11/26,10:00:00,12:00:00,5,,1,Rupture`);
  assert.equal(r.orders.length, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.orders[0].status, "CANCELLED");
});

test("magasins Hyper", () => {
  assert.ok(isHyperStore("Hyper Dar Bouazza") && isHyperStore("Hypermarché X"));
  assert.ok(!isHyperStore("Market Anfa") && !isHyperStore("Express Oulfa"));
});

test("créneau et heures", () => {
  assert.equal(normalizeCreneau("10h-12h"), "10:00-12:00");
  assert.equal(slotFromRow("", "10:00:00", "12:00:00"), "10:00-12:00");
  assert.equal(slotFromRow("", "", ""), "Sans créneau");
  assert.equal(toClock("14:00:00"), "14:00");
  assert.equal(toIsoDate("11/11/26"), "2026-11-11");
  assert.equal(toIsoDate("10/11/26 10:19:29"), "2026-11-10");
  assert.equal(toIsoDate("05/11/2026"), "2026-11-05");
});

test("extrait réel de la requête Redash 4441 (en-tête complet, lignes Hyper)", () => {
  const csv = `Order Date,Order Number,Chargement date,Store,Status,Initial Amount,Total Amount Paid,Day Of Delivery,Debut De Creneau,Fin De Creneau,Picker Name,Date de cloture,Shopper Name,Instructions Au Livreur,checkout_completed_at,Date d'acceptation prep,Order Preparation End,Number Of Products,Delivery Type,Organization,Fraudeur,LatLong,Latitude,Longitude,Latitude_store,Longitude_store,Number Of Final Products,Customer id,Etat Shopper,Etat Picker,Date d'assignation,Cancel_reason
10/11/26 10:19:29,470043,11/11/26 09:47:13,Hyper Targa,fulfilled,"2146,28","1526,08",11/11/26,10:00:00,12:00:00,ADIL BARKHAOSS,11/11/26 11:34:32,BENZIDANE YASSINE,,10/11/26 10:19,11/11/26 07:25:36,11/11/26 08:25:30,27,Planned Order,Beinterim,Non,"31.648785,-8.068408",31.648785,-8.068408,31.65087,-8.059124,23,239408,complete,complete,11/11/26 10:18:55,
10/11/26 10:46:41,470069,11/11/26 08:56:40,Hyper Al Mazar,fulfilled,"977,05","825,00",11/11/26,10:00:00,12:00:00,AYOUB EL JOBAYRY,11/11/26 11:49:35,MUSTAPHA CHEMSI,,10/11/26 10:46,11/11/26 07:21:57,11/11/26 08:54:46,21,Planned Order,Beinterim,Non,"31.606706,-7.91808",31.606706,-7.91808,31.592608,-7.987111,21,379228,complete,complete,11/11/26 10:36:04,
`;
  const r = parseRedashCsv(csv);
  assert.equal(r.orders.length, 2);
  assert.deepEqual(r.orders.map((o) => [o.store, o.slot, o.date, o.products, o.status]), [
    ["Hyper Targa", "10:00-12:00", "2026-11-11", 27, "OK"],
    ["Hyper Al Mazar", "10:00-12:00", "2026-11-11", 21, "OK"],
  ]);
  assert.equal(r.orders[0].raw["LatLong"], "31.648785,-8.068408");
});
