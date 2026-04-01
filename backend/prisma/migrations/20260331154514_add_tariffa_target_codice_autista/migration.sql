-- CreateEnum
CREATE TYPE "Ruolo" AS ENUM ('ADMIN', 'OPERATORE', 'VIEWER');

-- CreateEnum
CREATE TYPE "TipoMezzo" AS ENUM ('FURGONE', 'AUTOCARRO', 'AUTO', 'MOTOCICLO');

-- CreateEnum
CREATE TYPE "Alimentazione" AS ENUM ('GASOLIO', 'ELETTRICO', 'GASOLIO_MHEV', 'BENZINA', 'IBRIDO');

-- CreateEnum
CREATE TYPE "CategoriaMezzo" AS ENUM ('DISTRIBUZIONE', 'AUTO_AZIENDALE');

-- CreateEnum
CREATE TYPE "StatoMezzo" AS ENUM ('DISPONIBILE', 'ASSEGNATO', 'IN_REVISIONE', 'FUORI_SERVIZIO', 'VENDUTO', 'DISMESSO');

-- CreateEnum
CREATE TYPE "StatoPalmare" AS ENUM ('DISPONIBILE', 'ASSEGNATO', 'GUASTO', 'DISMESSO');

-- CreateEnum
CREATE TYPE "StatoConteggio" AS ENUM ('BOZZA', 'CHIUSO', 'CONFERMATO');

-- CreateEnum
CREATE TYPE "Segno" AS ENUM ('POSITIVO', 'NEGATIVO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "ruolo" "Ruolo" NOT NULL DEFAULT 'OPERATORE',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permessi" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "risorsa" TEXT NOT NULL,
    "azione" TEXT NOT NULL,

    CONSTRAINT "permessi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "azione" TEXT NOT NULL,
    "data_prima" JSONB,
    "data_dopo" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mezzi" (
    "id" TEXT NOT NULL,
    "targa" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modello" TEXT NOT NULL,
    "tipo" "TipoMezzo" NOT NULL DEFAULT 'FURGONE',
    "alimentazione" "Alimentazione" NOT NULL DEFAULT 'GASOLIO',
    "categoria" "CategoriaMezzo" NOT NULL DEFAULT 'DISTRIBUZIONE',
    "stato" "StatoMezzo" NOT NULL DEFAULT 'DISPONIBILE',
    "anno_immatricolazione" INTEGER,
    "tipo_possesso" TEXT NOT NULL DEFAULT 'NOLEGGIO',
    "societa_noleggio" TEXT,
    "p_iva_locatore" TEXT,
    "telefono_locatore" TEXT,
    "email_locatore" TEXT,
    "riferimento_contratto" TEXT,
    "rata_noleggio" DECIMAL(10,2),
    "canone_noleggio" DECIMAL(10,2),
    "inizio_noleggio" TIMESTAMP(3),
    "fine_noleggio" TIMESTAMP(3),
    "km_attuali" INTEGER,
    "km_limite" INTEGER,
    "scadenza_assicurazione" TIMESTAMP(3),
    "scadenza_revisione" TIMESTAMP(3),
    "scadenza_bollo" TIMESTAMP(3),
    "scadenza_tagliando" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "mezzi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assegnazioni_mezzi" (
    "id" TEXT NOT NULL,
    "mezzo_id" TEXT NOT NULL,
    "padroncino_id" TEXT NOT NULL,
    "data_inizio" TIMESTAMP(3) NOT NULL,
    "data_fine" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assegnazioni_mezzi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "padroncini" (
    "id" TEXT NOT NULL,
    "ragione_sociale" TEXT NOT NULL,
    "partita_iva" TEXT,
    "codice_fiscale" TEXT,
    "indirizzo" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "pec" TEXT,
    "iban" TEXT,
    "scadenza_durc" TIMESTAMP(3),
    "scadenza_dvr" TIMESTAMP(3),
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "padroncini_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "palmari" (
    "id" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "marca" TEXT,
    "modello" TEXT,
    "imei" TEXT,
    "sim_numero" TEXT,
    "tariffa_mensile" DECIMAL(10,2),
    "stato" "StatoPalmare" NOT NULL DEFAULT 'DISPONIBILE',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "palmari_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assegnazioni_palmari" (
    "id" TEXT NOT NULL,
    "palmare_id" TEXT NOT NULL,
    "padroncino_id" TEXT NOT NULL,
    "data_inizio" TIMESTAMP(3) NOT NULL,
    "data_fine" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assegnazioni_palmari_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codici_autisti" (
    "id" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT,
    "cognome" TEXT,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tariffa_fissa" DECIMAL(10,2),
    "tariffa_ritiro" DECIMAL(10,2),
    "target" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "codici_autisti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assegnazioni_codici_autisti" (
    "id" TEXT NOT NULL,
    "codice_autista_id" TEXT NOT NULL,
    "padroncino_id" TEXT NOT NULL,
    "data_inizio" TIMESTAMP(3) NOT NULL,
    "data_fine" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assegnazioni_codici_autisti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acconti" (
    "id" TEXT NOT NULL,
    "codice_autista_id" TEXT NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descrizione" TEXT,
    "mese" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "acconti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteggi_mensili" (
    "id" TEXT NOT NULL,
    "padroncino_id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "stato" "StatoConteggio" NOT NULL DEFAULT 'BOZZA',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conteggi_mensili_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteggi_righe" (
    "id" TEXT NOT NULL,
    "conteggio_mensile_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "segno" "Segno" NOT NULL DEFAULT 'POSITIVO',
    "categoria" TEXT,
    "riferimento_tipo" TEXT,
    "riferimento_id" TEXT,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "modifica_manuale" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conteggi_righe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documenti" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "dimensione" INTEGER,
    "scadenza" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documenti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "colore" TEXT DEFAULT '#6366f1',

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "contenuto" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ricariche_elettriche" (
    "id" TEXT NOT NULL,
    "mezzo_id" TEXT,
    "padroncino_id" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "kwh" DECIMAL(10,3),
    "fornitore" TEXT,
    "note" TEXT,
    "mese" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ricariche_elettriche_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "permessi_user_id_risorsa_azione_key" ON "permessi"("user_id", "risorsa", "azione");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mezzi_targa_key" ON "mezzi"("targa");

-- CreateIndex
CREATE INDEX "mezzi_stato_idx" ON "mezzi"("stato");

-- CreateIndex
CREATE INDEX "mezzi_categoria_idx" ON "mezzi"("categoria");

-- CreateIndex
CREATE INDEX "mezzi_deleted_at_idx" ON "mezzi"("deleted_at");

-- CreateIndex
CREATE INDEX "assegnazioni_mezzi_mezzo_id_data_inizio_data_fine_idx" ON "assegnazioni_mezzi"("mezzo_id", "data_inizio", "data_fine");

-- CreateIndex
CREATE INDEX "assegnazioni_mezzi_padroncino_id_idx" ON "assegnazioni_mezzi"("padroncino_id");

-- CreateIndex
CREATE INDEX "assegnazioni_mezzi_deleted_at_idx" ON "assegnazioni_mezzi"("deleted_at");

-- CreateIndex
CREATE INDEX "padroncini_deleted_at_idx" ON "padroncini"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "palmari_codice_key" ON "palmari"("codice");

-- CreateIndex
CREATE INDEX "palmari_deleted_at_idx" ON "palmari"("deleted_at");

-- CreateIndex
CREATE INDEX "assegnazioni_palmari_palmare_id_data_inizio_data_fine_idx" ON "assegnazioni_palmari"("palmare_id", "data_inizio", "data_fine");

-- CreateIndex
CREATE INDEX "assegnazioni_palmari_padroncino_id_idx" ON "assegnazioni_palmari"("padroncino_id");

-- CreateIndex
CREATE UNIQUE INDEX "codici_autisti_codice_key" ON "codici_autisti"("codice");

-- CreateIndex
CREATE INDEX "codici_autisti_deleted_at_idx" ON "codici_autisti"("deleted_at");

-- CreateIndex
CREATE INDEX "assegnazioni_codici_autisti_codice_autista_id_data_inizio_d_idx" ON "assegnazioni_codici_autisti"("codice_autista_id", "data_inizio", "data_fine");

-- CreateIndex
CREATE INDEX "assegnazioni_codici_autisti_padroncino_id_idx" ON "assegnazioni_codici_autisti"("padroncino_id");

-- CreateIndex
CREATE INDEX "acconti_codice_autista_id_idx" ON "acconti"("codice_autista_id");

-- CreateIndex
CREATE INDEX "acconti_mese_idx" ON "acconti"("mese");

-- CreateIndex
CREATE INDEX "acconti_deleted_at_idx" ON "acconti"("deleted_at");

-- CreateIndex
CREATE INDEX "conteggi_mensili_mese_idx" ON "conteggi_mensili"("mese");

-- CreateIndex
CREATE INDEX "conteggi_mensili_stato_idx" ON "conteggi_mensili"("stato");

-- CreateIndex
CREATE INDEX "conteggi_mensili_deleted_at_idx" ON "conteggi_mensili"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "conteggi_mensili_padroncino_id_mese_key" ON "conteggi_mensili"("padroncino_id", "mese");

-- CreateIndex
CREATE INDEX "conteggi_righe_conteggio_mensile_id_idx" ON "conteggi_righe"("conteggio_mensile_id");

-- CreateIndex
CREATE INDEX "conteggi_righe_tipo_idx" ON "conteggi_righe"("tipo");

-- CreateIndex
CREATE INDEX "documenti_entity_type_entity_id_idx" ON "documenti"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "documenti_scadenza_idx" ON "documenti"("scadenza");

-- CreateIndex
CREATE INDEX "documenti_deleted_at_idx" ON "documenti"("deleted_at");

-- CreateIndex
CREATE INDEX "tags_entity_type_entity_id_idx" ON "tags"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "note_entity_type_entity_id_idx" ON "note"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ricariche_elettriche_mezzo_id_idx" ON "ricariche_elettriche"("mezzo_id");

-- CreateIndex
CREATE INDEX "ricariche_elettriche_padroncino_id_idx" ON "ricariche_elettriche"("padroncino_id");

-- CreateIndex
CREATE INDEX "ricariche_elettriche_mese_idx" ON "ricariche_elettriche"("mese");

-- AddForeignKey
ALTER TABLE "permessi" ADD CONSTRAINT "permessi_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assegnazioni_mezzi" ADD CONSTRAINT "assegnazioni_mezzi_mezzo_id_fkey" FOREIGN KEY ("mezzo_id") REFERENCES "mezzi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assegnazioni_mezzi" ADD CONSTRAINT "assegnazioni_mezzi_padroncino_id_fkey" FOREIGN KEY ("padroncino_id") REFERENCES "padroncini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assegnazioni_palmari" ADD CONSTRAINT "assegnazioni_palmari_palmare_id_fkey" FOREIGN KEY ("palmare_id") REFERENCES "palmari"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assegnazioni_palmari" ADD CONSTRAINT "assegnazioni_palmari_padroncino_id_fkey" FOREIGN KEY ("padroncino_id") REFERENCES "padroncini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assegnazioni_codici_autisti" ADD CONSTRAINT "assegnazioni_codici_autisti_codice_autista_id_fkey" FOREIGN KEY ("codice_autista_id") REFERENCES "codici_autisti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assegnazioni_codici_autisti" ADD CONSTRAINT "assegnazioni_codici_autisti_padroncino_id_fkey" FOREIGN KEY ("padroncino_id") REFERENCES "padroncini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acconti" ADD CONSTRAINT "acconti_codice_autista_id_fkey" FOREIGN KEY ("codice_autista_id") REFERENCES "codici_autisti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteggi_mensili" ADD CONSTRAINT "conteggi_mensili_padroncino_id_fkey" FOREIGN KEY ("padroncino_id") REFERENCES "padroncini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteggi_righe" ADD CONSTRAINT "conteggi_righe_conteggio_mensile_id_fkey" FOREIGN KEY ("conteggio_mensile_id") REFERENCES "conteggi_mensili"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteggi_righe" ADD CONSTRAINT "fk_righe_mezzo" FOREIGN KEY ("riferimento_id") REFERENCES "mezzi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteggi_righe" ADD CONSTRAINT "fk_righe_palmare" FOREIGN KEY ("riferimento_id") REFERENCES "palmari"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteggi_righe" ADD CONSTRAINT "fk_righe_acconto" FOREIGN KEY ("riferimento_id") REFERENCES "acconti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documenti" ADD CONSTRAINT "fk_doc_mezzo" FOREIGN KEY ("entity_id") REFERENCES "mezzi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documenti" ADD CONSTRAINT "fk_doc_padroncino" FOREIGN KEY ("entity_id") REFERENCES "padroncini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documenti" ADD CONSTRAINT "fk_doc_palmare" FOREIGN KEY ("entity_id") REFERENCES "palmari"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "fk_tag_mezzo" FOREIGN KEY ("entity_id") REFERENCES "mezzi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "fk_tag_padroncino" FOREIGN KEY ("entity_id") REFERENCES "padroncini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "fk_tag_palmare" FOREIGN KEY ("entity_id") REFERENCES "palmari"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "fk_nota_mezzo" FOREIGN KEY ("entity_id") REFERENCES "mezzi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "fk_nota_padroncino" FOREIGN KEY ("entity_id") REFERENCES "padroncini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
