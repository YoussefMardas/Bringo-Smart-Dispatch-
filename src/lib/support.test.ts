import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffDelay } from "./retry";
import { storeEmail } from "./account-names";
import { generatePassword } from "./passwords";
import { pickerChangeText } from "./notification-text";

test("backoff : 5 s, 10 s, 20 s… plafonné à 60 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map((a) => backoffDelay(a)), [5000, 10000, 20000, 40000, 60000, 60000]);
});

test("e-mails des comptes magasin : normalisés et uniques", () => {
  const taken = new Set<string>();
  const a = storeEmail("Hyper Dar Bouazza", "bringo.ma", taken);
  assert.equal(a, "hyper.dar.bouazza@bringo.ma");
  taken.add(a);
  assert.equal(storeEmail("HYPER  Dar Bouazza", "bringo.ma", taken), "hyper.dar.bouazza.2@bringo.ma");
  assert.equal(storeEmail("Hyper Aïn Sebaâ", "bringo.ma", new Set()), "hyper.ain.sebaa@bringo.ma");
});

test("mots de passe générés : format, alphabet et aléa", () => {
  const set = new Set(Array.from({ length: 200 }, () => generatePassword()));
  assert.equal(set.size, 200);
  for (const p of set) assert.match(p, /^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){2}$/);
});

test("texte de notification : modification du nombre de pickers", () => {
  const n = pickerChangeText({
    storeName: "Hyper Dar Bouazza",
    actorName: "Master Magasin 1",
    before: 4,
    after: 6,
    date: "2026-11-05",
    slotLabel: "10:00 – 12:00",
  });
  assert.equal(n.title, "Pickers modifiés — Hyper Dar Bouazza");
  assert.match(n.message, /de 4 à 6 pickers \(\+2\)/);
  assert.match(n.message, /05\/11\/2026/);
  assert.match(pickerChangeText({ storeName: "H", actorName: "A", before: 0, after: 1, date: "2026-11-05", slotLabel: "x" }).message, /défini à 1 picker \(auparavant non renseigné\)/);
  assert.match(pickerChangeText({ storeName: "H", actorName: "A", before: 5, after: 3, date: "2026-11-05", slotLabel: "x" }).message, /\(−2\)/);
});
