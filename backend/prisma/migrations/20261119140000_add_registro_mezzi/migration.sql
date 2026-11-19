-- CreateTable
CREATE TABLE "registro_mezzi" (
    "id" TEXT NOT NULL,
    "conteggio_riga_id" TEXT,
    "conteggio_mensile_id" TEXT,
    "mese" TEXT,
    "padroncino_id" TEXT,
    "mezzo_id" TEXT,
    "targa" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ALTRO',
    "numero" TEXT,
    "data_evento" DATE,
    "descrizione" TEXT NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "perc_iva" DECIMAL(5,2),
    "stato" TEXT NOT NULL DEFAULT 'APERTO',
    "note" TEXT,
    "manuale" BOOLEAN NOT NULL DEFAULT false,
    "modificato_a_mano" BOOLEAN NOT NULL DEFAULT false,
    "riga_eliminata" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "registro_mezzi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registro_mezzi_conteggio_riga_id_key" ON "registro_mezzi"("conteggio_riga_id");

-- CreateIndex
CREATE INDEX "registro_mezzi_mezzo_id_idx" ON "registro_mezzi"("mezzo_id");

-- CreateIndex
CREATE INDEX "registro_mezzi_targa_idx" ON "registro_mezzi"("targa");

-- CreateIndex
CREATE INDEX "registro_mezzi_padroncino_id_idx" ON "registro_mezzi"("padroncino_id");

-- CreateIndex
CREATE INDEX "registro_mezzi_mese_idx" ON "registro_mezzi"("mese");

-- AddForeignKey
ALTER TABLE "registro_mezzi" ADD CONSTRAINT "registro_mezzi_mezzo_id_fkey" FOREIGN KEY ("mezzo_id") REFERENCES "mezzi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_mezzi" ADD CONSTRAINT "registro_mezzi_padroncino_id_fkey" FOREIGN KEY ("padroncino_id") REFERENCES "padroncini"("id") ON DELETE SET NULL ON UPDATE CASCADE;

