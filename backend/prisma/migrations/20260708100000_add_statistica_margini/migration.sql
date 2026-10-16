-- CreateTable statistica_margini
CREATE TABLE IF NOT EXISTS "statistica_margini" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "dati" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "statistica_margini_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "statistica_margini_mese_key" ON "statistica_margini"("mese");
