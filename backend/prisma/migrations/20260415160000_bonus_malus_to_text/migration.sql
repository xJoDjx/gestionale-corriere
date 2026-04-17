-- AlterTable: converti bonus_malus da DECIMAL a TEXT
ALTER TABLE "codici_autisti" ALTER COLUMN "bonus_malus" TYPE TEXT USING "bonus_malus"::TEXT;
