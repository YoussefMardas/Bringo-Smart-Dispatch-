import test from "node:test";
import assert from "node:assert/strict";
import { classifyStatus, isDispatchable } from "./order-status";

test("OK et retard sont dispatchables", () => {
  assert.equal(classifyStatus({ "Status Acceptation": "OK" }), "OK");
  assert.equal(classifyStatus({ "Status Acceptation": " ok " }), "OK");
  assert.equal(classifyStatus({ "Status Acceptation": "Retard" }), "LATE");
  assert.equal(classifyStatus({ "Status Acceptation": "En retard" }), "LATE");
  assert.ok(isDispatchable("OK") && isDispatchable("LATE"));
});

test("annulée exclue, quelle que soit la colonne", () => {
  assert.equal(classifyStatus({ "Status Acceptation": "Annulée" }), "CANCELLED");
  assert.equal(classifyStatus({ "Status Acceptation": "OK", Status: "Cancelled" }), "CANCELLED");
  assert.equal(classifyStatus({ Status: "ANNULEE" }), "CANCELLED");
  assert.ok(!isDispatchable("CANCELLED"));
});

test("source Redash : new / fulfilled dispatchables, cancelled exclue", () => {
  assert.equal(classifyStatus({ Status: "fulfilled", Cancel_reason: null }), "OK");
  assert.equal(classifyStatus({ Status: "new" }), "OK");
  assert.equal(classifyStatus({ Status: "cancelled", Cancel_reason: "Rupture" }), "CANCELLED");
  assert.equal(classifyStatus({ Status: "new", Cancel_reason: "Rupture" }), "CANCELLED");
  assert.equal(classifyStatus({}), "OK");
  assert.equal(classifyStatus(null), "OK");
});

test("statut d'acceptation renseigné mais inconnu : ni dispatché ni compté", () => {
  assert.equal(classifyStatus({ "Status Acceptation": "En attente" }), "OTHER");
  assert.ok(!isDispatchable("OTHER"));
});
