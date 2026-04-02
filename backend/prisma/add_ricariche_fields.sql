-- Migration: amplia ricariche_elettriche per persistere i dati CSV elaborati
-- Da eseguire con: npx prisma db push  oppure  npx prisma migrate dev

-- Aggiunge colonne mancanti alla tabella esistente
ALTER TABLE ricariche_elettriche
  ADD COLUMN IF NOT EXISTS targa           VARCHAR,
  ADD COLUMN IF NOT EXISTS tipo_ricarica   VARCHAR DEFAULT 'INTERNA',   -- 'INTERNA' | 'ESTERNA'
  ADD COLUMN IF NOT EXISTS stazione        VARCHAR,
  ADD COLUMN IF NOT EXISTS durata          VARCHAR,
  ADD COLUMN IF NOT EXISTS inizio_sessione VARCHAR,
  ADD COLUMN IF NOT EXISTS fine_sessione   VARCHAR,
  ADD COLUMN IF NOT EXISTS costo_unitario  DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS costo_base      DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS maggiorazione   DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS costo_finale    DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS categoria_mezzo VARCHAR,    -- 'DISTRIBUZIONE' | 'AUTO_AZIENDALE'
  ADD COLUMN IF NOT EXISTS sessione_id     VARCHAR,    -- ID sessione originale CSV (dedup)
  ADD COLUMN IF NOT EXISTS costo_interno_kwh DECIMAL(10,4),  -- snapshot tariffa usata
  ADD COLUMN IF NOT EXISTS costo_esterno_kwh DECIMAL(10,4),  -- snapshot tariffa usata
  ADD COLUMN IF NOT EXISTS fattura_importo DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS fattura_kwh     DECIMAL(10,3);

-- Indici utili
CREATE INDEX IF NOT EXISTS idx_ricariche_targa ON ricariche_elettriche(targa);
CREATE INDEX IF NOT EXISTS idx_ricariche_tipo ON ricariche_elettriche(tipo_ricarica);
CREATE INDEX IF NOT EXISTS idx_ricariche_sessione_id ON ricariche_elettriche(sessione_id);
