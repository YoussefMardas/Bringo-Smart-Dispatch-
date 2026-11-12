-- Statut métier des commandes (OK / LATE / CANCELLED / OTHER), déduit de « Status Acceptation » à l'import.
ALTER TABLE "Order" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OTHER';

-- Reprise des données existantes (même règle que src/lib/order-status.ts)
UPDATE "Order" SET "status" = CASE
  WHEN lower(coalesce("raw"->>'Status Acceptation','') || ' ' || coalesce("raw"->>'Status','')) ~ '(annul|cancel)' THEN 'CANCELLED'
  WHEN lower(coalesce("raw"->>'Status Acceptation','')) ~ '(retard|late|delay)' THEN 'LATE'
  WHEN lower(trim(coalesce("raw"->>'Status Acceptation',''))) ~ '^(ok$|accept|valide|confirm)' THEN 'OK'
  WHEN "raw" IS NULL THEN 'OK'  -- commandes saisies avant l'import .xlsm : considérées acceptées
  ELSE 'OTHER'
END;

DROP INDEX IF EXISTS "Order_slotId_idx";
CREATE INDEX "Order_slotId_status_idx" ON "Order"("slotId", "status");
