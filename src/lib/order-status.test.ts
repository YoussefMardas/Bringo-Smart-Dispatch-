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

test("statut vide ou inconnu : ni dispatché ni compté", () => {
  assert.equal(classifyStatus({}), "OTHER");
  assert.equal(classifyStatus(null), "OTHER");
  assert.equal(classifyStatus({ "Status Acceptation": "En attente" }), "OTHER");
  assert.ok(!isDispatchable("OTHER"));
});
