-- CreateTable manutenzioni
CREATE TABLE IF NOT EXISTS "manutenzioni" (
    "id" TEXT NOT NULL,
    "mezzo_id" TEXT NOT NULL,
    "data_inizio" TIMESTAMP(3) NOT NULL,
    "data_fine" TIMESTAMP(3),
    "descrizione" TEXT NOT NULL,
    "costo" DECIMAL(10,2),
    "fattura_path" TEXT,
    "fattura_nome" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "manutenzioni_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "manutenzioni_mezzo_id_fkey" FOREIGN KEY ("mezzo_id") REFERENCES "mezzi"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "manutenzioni_mezzo_id_idx" ON "manutenzioni"("mezzo_id");
CREATE INDEX IF NOT EXISTS "manutenzioni_data_inizio_idx" ON "manutenzioni"("data_inizio");
CREATE INDEX IF NOT EXISTS "manutenzioni_deleted_at_idx" ON "manutenzioni"("deleted_at");

-- AddColumn fornitore
ALTER TABLE "manutenzioni" ADD COLUMN IF NOT EXISTS "fornitore" TEXT;
