-- AlterTable: aggiunge il campo utilizzatore al model Mezzo
-- Se valorizzato, il mezzo NON è disponibile (usato da un dipendente)
ALTER TABLE "mezzi" ADD COLUMN "utilizzatore" TEXT;
