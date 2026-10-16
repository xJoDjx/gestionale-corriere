-- CreateEnum
CREATE TYPE "CategoriaVoceConteggio" AS ENUM ('ADDEBITO', 'FATTURATO', 'COMPENSAZIONE');

-- AlterTable
ALTER TABLE "conteggi_righe" ADD COLUMN "conto_voce" TEXT;

-- CreateTable
CREATE TABLE "voci_conteggio" (
    "id" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "conto_voce" TEXT,
    "perc_iva" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "valore_default" DECIMAL(10,2),
    "categoria" "CategoriaVoceConteggio" NOT NULL,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "voci_conteggio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voci_conteggio_categoria_idx" ON "voci_conteggio"("categoria");

-- CreateIndex
CREATE INDEX "voci_conteggio_deleted_at_idx" ON "voci_conteggio"("deleted_at");
