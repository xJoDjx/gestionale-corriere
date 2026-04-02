-- AlterTable
ALTER TABLE "ricariche_elettriche" ADD COLUMN     "categoria_mezzo" TEXT,
ADD COLUMN     "costo_base" DECIMAL(10,2),
ADD COLUMN     "costo_esterno_kwh" DECIMAL(10,4),
ADD COLUMN     "costo_interno_kwh" DECIMAL(10,4),
ADD COLUMN     "costo_unitario" DECIMAL(10,4),
ADD COLUMN     "durata" TEXT,
ADD COLUMN     "fattura_importo" DECIMAL(10,2),
ADD COLUMN     "fattura_kwh" DECIMAL(10,3),
ADD COLUMN     "fine_sessione" TEXT,
ADD COLUMN     "inizio_sessione" TEXT,
ADD COLUMN     "maggiorazione" DECIMAL(5,2),
ADD COLUMN     "sessione_id" TEXT,
ADD COLUMN     "stazione" TEXT,
ADD COLUMN     "targa" TEXT,
ADD COLUMN     "tipo_ricarica" TEXT NOT NULL DEFAULT 'INTERNA';

-- CreateIndex
CREATE INDEX "ricariche_elettriche_targa_idx" ON "ricariche_elettriche"("targa");

-- CreateIndex
CREATE INDEX "ricariche_elettriche_sessione_id_idx" ON "ricariche_elettriche"("sessione_id");

-- CreateIndex
CREATE INDEX "ricariche_elettriche_deleted_at_idx" ON "ricariche_elettriche"("deleted_at");

-- AddForeignKey
ALTER TABLE "ricariche_elettriche" ADD CONSTRAINT "ricariche_elettriche_mezzo_id_fkey" FOREIGN KEY ("mezzo_id") REFERENCES "mezzi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ricariche_elettriche" ADD CONSTRAINT "ricariche_elettriche_padroncino_id_fkey" FOREIGN KEY ("padroncino_id") REFERENCES "padroncini"("id") ON DELETE SET NULL ON UPDATE CASCADE;
