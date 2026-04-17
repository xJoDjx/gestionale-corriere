-- AlterTable: rende userId nullable in audit_logs
-- Alcuni log vengono scritti da azioni di sistema senza utente autenticato
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;
