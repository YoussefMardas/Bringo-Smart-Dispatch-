-- AlterTable : les commandes sont rattachées directement à un magasin et conservent les colonnes brutes du fichier
ALTER TABLE "Order" ADD COLUMN "storeId" TEXT,
ADD COLUMN "raw" JSONB;

-- Reprise des données existantes
UPDATE "Order" o SET "storeId" = w."storeId" FROM "WorkSlot" w WHERE w."id" = o."slotId";

ALTER TABLE "Order" ALTER COLUMN "storeId" SET NOT NULL;

-- DropIndex
DROP INDEX "Order_slotId_reference_key";

-- CreateIndex
CREATE INDEX "Order_storeId_idx" ON "Order"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_reference_key" ON "Order"("storeId", "reference");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
