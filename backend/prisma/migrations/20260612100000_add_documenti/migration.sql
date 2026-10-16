-- CreateTable documenti
CREATE TABLE IF NOT EXISTS "documenti" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "dimensione" INTEGER,
    "scadenza" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "documenti_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "documenti_entity_type_entity_id_idx" ON "documenti"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "documenti_scadenza_idx" ON "documenti"("scadenza");
CREATE INDEX IF NOT EXISTS "documenti_deleted_at_idx" ON "documenti"("deleted_at");
