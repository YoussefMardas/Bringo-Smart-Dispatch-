-- Synchronisation serveur de la source CSV : verrou, planification, reprise après échec, résumé.
ALTER TABLE "SyncState"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "failures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastSummary" JSONB;
