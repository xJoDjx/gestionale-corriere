-- CreateTable note
CREATE TABLE IF NOT EXISTS "note" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "contenuto" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "note_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "note_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "note_entity_type_entity_id_idx" ON "note"("entity_type", "entity_id");
