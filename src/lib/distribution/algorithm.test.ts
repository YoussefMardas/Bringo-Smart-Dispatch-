import { test } from "node:test";
import assert from "node:assert/strict";
import { distributeOrders, evaluateAssignment } from "./algorithm";
import type { OrderInput } from "./types";

const mk = (sizes: number[]): OrderInput[] =>
  sizes.map((articles, i) => ({ id: `o${i + 1}`, reference: `Commande ${i + 1}`, articles }));

/** Groupes de commandes par picker, indépendants de la numérotation des pickers. */
const groups = (r: ReturnType<typeof distributeOrders>) =>
  r.pickers.map((p) => [...p.orderIds].sort().join("+")).sort();

test("exemple du cahier des charges : répartition initiale et renfort", () => {
  // Commande 1 : 80, 2 : 120, 3 : 20, 4 : 5, 5 : 65 — 4 pickers.
  // NB : la somme réelle est 290 (le cahier des charges indique 300 par erreur).
  const orders = mk([80, 120, 20, 5, 65]);
  const r = distributeOrders(orders, { pickers: 4 });

  assert.equal(r.totalOrders, 5);
  assert.equal(r.totalArticles, 290);

  // Picker « 65 + 5 » ; picker « 80 » ; picker « 20 » ; picker « 120 ».
  assert.deepEqual(groups(r), ["o1", "o2", "o3", "o4+o5"].sort());
  assert.deepEqual(
    r.pickers.map((p) => p.assignedArticles).sort((a, b) => a - b),
    [20, 70, 80, 120],
  );

  // Le picker de la commande 3 (20 articles) finit en premier et aide celui de la commande 2.
  const first = r.assists[0];
  assert.equal(first.time, 20);
  assert.equal(first.orderId, "o2");
  const helper = r.pickers[first.helper - 1];
  const owner = r.pickers[first.owner - 1];
  assert.deepEqual(helper.orderIds, ["o3"]);
  assert.deepEqual(owner.orderIds, ["o2"]);
  assert.equal(first.remainingBefore, 100);

  // Temps de fin : jamais sous la borne théorique, et très proche (renforts compris).
  assert.equal(r.lowerBound, 72.5);
  assert.ok(r.makespan >= r.lowerBound);
  assert.ok(r.makespan <= 75);
});

test("tout est affecté une fois et le travail est conservé", () => {
  const orders = mk([80, 120, 20, 5, 65]);
  const r = distributeOrders(orders, { pickers: 4 });
  const all = r.pickers.flatMap((p) => p.orderIds).sort();
  assert.deepEqual(all, orders.map((o) => o.id).sort());
  const worked = r.pickers.reduce((s, p) => s + p.workedArticles, 0);
  assert.ok(Math.abs(worked - 290) < 1e-6);
});

test("cas général : charges égalisées sans renfort nécessaire", () => {
  const r = distributeOrders(mk([30, 30, 30, 10, 10, 10]), { pickers: 3 });
  assert.equal(r.makespan, 40);
  assert.equal(r.assists.length, 0);
  assert.deepEqual(
    r.pickers.map((p) => p.assignedArticles),
    [40, 40, 40],
  );
});

test("un seul picker : tout en séquence, aucun renfort", () => {
  const r = distributeOrders(mk([10, 20, 30]), { pickers: 1 });
  assert.equal(r.makespan, 60);
  assert.equal(r.assists.length, 0);
});

test("plus de pickers que de commandes : les pickers libres renforcent", () => {
  const r = distributeOrders(mk([100, 100]), { pickers: 4 });
  assert.equal(r.makespan, 50);
  assert.equal(r.assists.length, 2);
});

test("seuil de renfort : une petite commande n'est pas fragmentée", () => {
  const r = distributeOrders(mk([8, 1]), { pickers: 2, minAssistChunk: 5 });
  assert.equal(r.assists.length, 0); // 7/2 < 5 : pas de renfort
  const r2 = distributeOrders(mk([8, 1]), { pickers: 2, minAssistChunk: 1 });
  assert.equal(r2.assists.length, 1);
  assert.ok(r2.makespan < r.makespan);
});

test("aucune commande : résultat vide valide", () => {
  const r = distributeOrders([], { pickers: 3 });
  assert.equal(r.makespan, 0);
  assert.equal(r.totalOrders, 0);
  assert.equal(r.pickers.length, 3);
});

test("entrées invalides rejetées", () => {
  assert.throws(() => distributeOrders(mk([5]), { pickers: 0 }));
  assert.throws(() => distributeOrders(mk([5]), { pickers: 2.5 }));
  assert.throws(() => distributeOrders(mk([0]), { pickers: 2 }));
  assert.throws(() => distributeOrders([{ id: "a", reference: "A", articles: 3 }, { id: "a", reference: "B", articles: 3 }], { pickers: 2 }));
});

test("ajustement manuel : évaluation d'une répartition donnée", () => {
  const orders = mk([80, 120, 20, 5, 65]);
  const r = evaluateAssignment(orders, [["o1", "o2"], ["o3", "o4", "o5"]], {});
  assert.equal(r.strategy, "manual");
  assert.equal(r.pickers[0].assignedArticles, 200);
  assert.throws(() => evaluateAssignment(orders, [["o1"], ["o2"]], {})); // commandes manquantes
  assert.throws(() => evaluateAssignment(orders, [["o1", "o1", "o2", "o3", "o4", "o5"], []], {}));
});

test("propriétés sur 300 jeux aléatoires (déterministes)", () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 25);
    const pickers = 1 + Math.floor(rnd() * 8);
    const orders = mk(Array.from({ length: n }, () => 1 + Math.floor(rnd() * 150)));
    const total = orders.reduce((s, o) => s + o.articles, 0);

    const r = distributeOrders(orders, { pickers });
    assert.equal(r.pickers.flatMap((p) => p.orderIds).length, n);
    assert.ok(r.makespan + 1e-3 >= total / pickers, "jamais sous la borne basse");
    assert.ok(r.makespan <= total + 1e-6);
    assert.ok(Math.abs(r.pickers.reduce((s, p) => s + p.workedArticles, 0) - total) < 1e-3);

    // Sans contrainte de fragmentation, le travail est parfaitement lissé.
    const free = distributeOrders(orders, { pickers, minAssistChunk: 0 });
    assert.ok(Math.abs(free.makespan - total / pickers) < 1e-3);
  }
});

test("limite de commandes par picker : respectée par toutes les stratégies", () => {
  // 7 petites commandes + 1 grosse, 3 pickers, max 3 commandes chacun.
  const orders = mk([200, 5, 5, 5, 5, 5, 5, 5]);
  const r = distributeOrders(orders, { pickers: 3, maxOrdersPerPicker: 3 });
  for (const p of r.pickers) assert.ok(p.orderIds.length <= 3);
  assert.equal(r.pickers.flatMap((p) => p.orderIds).length, 8);
});

test("limite : infaisable si trop de commandes, message avec le minimum de pickers", () => {
  assert.throws(
    () => distributeOrders(mk([1, 1, 1, 1, 1, 1, 1]), { pickers: 2, maxOrdersPerPicker: 3 }),
    /au moins 3 pickers/,
  );
  // Exactement 3 par picker : faisable.
  const r = distributeOrders(mk([9, 8, 7, 6, 5, 4]), { pickers: 2, maxOrdersPerPicker: 3 });
  assert.deepEqual(r.pickers.map((p) => p.orderIds.length), [3, 3]);
});

test("limite : l'ajustement manuel ne peut pas dépasser le maximum", () => {
  const orders = mk([10, 10, 10, 10]);
  assert.throws(
    () => evaluateAssignment(orders, [["o1", "o2", "o3", "o4"], []], { maxOrdersPerPicker: 3 }),
    /maximum 3/,
  );
});

test("limite : propriété sur jeux aléatoires", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 200; i++) {
    const pickers = 1 + Math.floor(rnd() * 6);
    const n = 1 + Math.floor(rnd() * pickers * 3);
    const orders = mk(Array.from({ length: n }, () => 1 + Math.floor(rnd() * 120)));
    const r = distributeOrders(orders, { pickers, maxOrdersPerPicker: 3 });
    for (const p of r.pickers) assert.ok(p.orderIds.length <= 3);
    assert.equal(r.pickers.flatMap((p) => p.orderIds).length, n);
  }
});
