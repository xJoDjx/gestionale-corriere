-- CreateTable margini_fatturato
CREATE TABLE IF NOT EXISTS "margini_fatturato" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "dati" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "margini_fatturato_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "margini_fatturato_mese_key" ON "margini_fatturato"("mese");

-- CreateTable margini_manuali
CREATE TABLE IF NOT EXISTS "margini_manuali" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "dati" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "margini_manuali_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "margini_manuali_mese_key" ON "margini_manuali"("mese");
