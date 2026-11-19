-- Righe conteggio: mese da cui la riga e stata duplicata
ALTER TABLE "conteggi_righe" ADD COLUMN IF NOT EXISTS "copiata_da_mese" TEXT;
