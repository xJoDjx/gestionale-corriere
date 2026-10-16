-- Aggiunge colonna perc_iva a conteggi_righe per persistere la % IVA
-- degli addebiti (in precedenza veniva ipotizzata al 22% sul reload).
ALTER TABLE "conteggi_righe" ADD COLUMN "perc_iva" DECIMAL(5,2);
