# Gestionale Corriere GLS

Gestionale web per la gestione di mezzi, padroncini, palmari e conteggi mensili.

## Requisiti

- Node.js 18+
- PostgreSQL 15+ (o Docker)
- npm o yarn

## Avvio rapido

### 1. Database PostgreSQL

Con Docker:
```bash
docker-compose up -d
```

Oppure crea manualmente un database `gestionale_corriere` su PostgreSQL.

### 2. Backend

```bash
cd backend

# Copia il file di configurazione
cp .env.example .env

# Installa dipendenze
npm install

# Copia lo schema Prisma nella posizione corretta
cp ../prisma/schema.prisma prisma/schema.prisma

# Genera il client Prisma
npx prisma generate

# Crea le tabelle nel database
npx prisma db push

# Popola con dati di esempio
npx ts-node ../prisma/seed.ts

# Avvia il server
npm run start:dev
```

Il backend sarà disponibile su `http://localhost:3000`.
Swagger UI: `http://localhost:3000/api/docs`

### 3. Frontend

```bash
cd frontend

# Installa dipendenze
npm install

# Avvia il dev server
npm run dev
```

Il frontend sarà disponibile su `http://localhost:5173`.

## Credenziali di default

- Email: `admin@gestionale.it`
- Password: `admin123`

## Struttura progetto

```
gestionale-corriere/
├── docker-compose.yml
├── prisma/
│   ├── schema.prisma          # Schema database completo
│   └── seed.ts                # Dati di esempio
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── main.ts            # Entry point NestJS
│       ├── app.module.ts      # Root module
│       ├── prisma/            # Database service
│       ├── auth/              # JWT + RBAC
│       ├── audit/             # Audit log centralizzato
│       ├── mezzi/             # CRUD mezzi + assegnazioni
│       ├── padroncini/        # CRUD padroncini
│       ├── palmari/           # CRUD palmari + assegnazioni
│       ├── codici-autista/    # Codici autista + assegnazioni
│       ├── acconti/           # Acconti con auto-link padroncino
│       └── conteggi/          # Conteggi mensili + generazione auto
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx            # Router principale
        ├── styles/            # Design system (variabili CSS)
        ├── stores/            # Zustand stores
        ├── lib/               # API client
        ├── components/layout/ # Sidebar + Layout
        └── features/
            ├── dashboard/     # Dashboard operativa
            ├── mezzi/         # Flotta Mezzi
            ├── conteggi/      # Conteggi Mensili
            ├── padroncini/    # Gestione Padroncini
            ├── palmari/       # Gestione Palmari
            └── codici-autista/# Codici Autisti
```

## API Endpoints

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/register` — Registrazione
- `GET /api/auth/profile` — Profilo utente

### Mezzi
- `GET /api/mezzi` — Lista con filtri
- `GET /api/mezzi/stats` — Statistiche flotta
- `GET /api/mezzi/scadenze` — Scadenze imminenti
- `GET /api/mezzi/:id` — Dettaglio mezzo
- `POST /api/mezzi` — Crea mezzo
- `PUT /api/mezzi/:id` — Aggiorna mezzo
- `DELETE /api/mezzi/:id` — Soft delete
- `POST /api/mezzi/:id/assegnazioni` — Assegna mezzo
- `PUT /api/mezzi/assegnazioni/:id/chiudi` — Chiudi assegnazione

### Padroncini
- `GET /api/padroncini` — Lista
- `GET /api/padroncini/select` — Lista per dropdown
- `GET /api/padroncini/scadenze` — DURC/DVR in scadenza
- `GET /api/padroncini/:id` — Dettaglio
- `POST /api/padroncini` — Crea
- `PUT /api/padroncini/:id` — Aggiorna
- `DELETE /api/padroncini/:id` — Soft delete

### Palmari
- `GET /api/palmari` — Lista
- `GET /api/palmari/:id` — Dettaglio
- `POST /api/palmari` — Crea
- `PUT /api/palmari/:id` — Aggiorna
- `DELETE /api/palmari/:id` — Soft delete
- `POST /api/palmari/:id/assegnazioni` — Assegna

### Codici Autista
- `GET /api/codici-autista` — Lista
- `GET /api/codici-autista/:id` — Dettaglio
- `POST /api/codici-autista` — Crea
- `POST /api/codici-autista/:id/assegna` — Assegna a padroncino
- `DELETE /api/codici-autista/:id` — Soft delete

### Acconti
- `GET /api/acconti` — Lista (filtro mese)
- `GET /api/acconti/padroncino/:id` — Per padroncino
- `POST /api/acconti` — Crea (auto-link padroncino)
- `DELETE /api/acconti/:id` — Soft delete

### Conteggi Mensili
- `GET /api/conteggi` — Lista (filtro mese/padroncino)
- `GET /api/conteggi/:id` — Dettaglio con totali
- `POST /api/conteggi` — Crea + genera righe automatiche
- `POST /api/conteggi/bulk` — Genera per tutti i padroncini
- `PUT /api/conteggi/:id/stato` — Aggiorna stato
- `POST /api/conteggi/:id/rigenera` — Rigenera righe auto
- `DELETE /api/conteggi/:id` — Soft delete
- `POST /api/conteggi/:id/righe` — Aggiungi riga
- `PUT /api/conteggi/righe/:id` — Modifica riga
- `DELETE /api/conteggi/righe/:id` — Elimina riga

## Architettura

- **Soft delete** su tutte le entità (`deleted_at`)
- **Audit log** centralizzato per ogni operazione
- **Assegnazioni temporali** con `data_inizio` / `data_fine`
- **Conteggi flessibili** con righe dinamiche (nessun limite ai tipi)
- **Generazione automatica** conteggi da mezzi, palmari, acconti, ricariche
- **RBAC** con ruoli Admin/Operatore/Viewer e permessi granulari
