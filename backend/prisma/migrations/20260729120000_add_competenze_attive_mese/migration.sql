-- CreateTable competenze_attive_mese
CREATE TABLE IF NOT EXISTS "competenze_attive_mese" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "valore" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "competenze_attive_mese_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "competenze_attive_mese_mese_key" ON "competenze_attive_mese"("mese");
