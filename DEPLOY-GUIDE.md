# Guida Deploy su Server Windows (NSSM)

## Prerequisiti da installare sul server

### 1. Node.js
Scarica e installa da: https://nodejs.org (versione LTS, es. 20.x)

Verifica dopo l'installazione:
```powershell
node --version   # deve rispondere v20.x.x
npm --version
```

### 2. PostgreSQL
Scarica da: https://www.postgresql.org/download/windows/

Durante l'installazione:
- Scegli una **password per l'utente `postgres`** e annotala
- Porta: **5432** (default)
- Lascia tutto il resto come default

Dopo l'installazione, crea il database:
```cmd
# Apri "SQL Shell (psql)" dal menu Start, entra con la password scelta
CREATE DATABASE gestionale_corriere;
\q
```

### 3. NSSM
Scarica da: https://nssm.cc/download

Estrai in `C:\nssm\` — il file che ti serve è `win64\nssm.exe`

---

## Aggiornamento da GitHub (metodo consigliato)

Sul server va **esattamente** la versione del ramo `main` su GitHub: niente file del PC di sviluppo, niente modifiche non salvate.

### Una volta sola, sul server
1. Installa **Git per Windows** (https://git-scm.com/download/win), lasciando le opzioni predefinite.
2. In PowerShell come Amministratore:
```powershell
git clone https://github.com/xJoDjx/gestionale-corriere.git C:\GestionaleCorriere-sorgente
```
   La prima volta Git apre il browser per l'accesso a GitHub (il repository e' privato): entra con il tuo account e autorizza. Le credenziali restano salvate.

### Ogni aggiornamento
1. Sul PC di sviluppo: modifiche caricate su GitHub e PR unita in `main`.
2. Sul server, PowerShell come Amministratore:
```powershell
powershell -ExecutionPolicy Bypass -File C:\GestionaleCorriere-sorgente\aggiorna-da-github.ps1
```
Lo script:
- scarica `main` da GitHub e la compila in `C:\GestionaleCorriere-sorgente` (il servizio resta acceso);
- salva il database e la versione attuale in `C:\GestionaleCorriere-backup\<data-ora>`;
- ferma il servizio, copia la nuova versione (`.env`, `uploads` e `logs` non vengono toccati), applica le migrazioni e riavvia;
- se qualcosa va storto rimette la versione precedente;
- scrive in `C:\GestionaleCorriere\VERSIONE.txt` quale versione e' in produzione.

### Tornare a una versione precedente
```powershell
powershell -ExecutionPolicy Bypass -File C:\GestionaleCorriere-sorgente\aggiorna-da-github.ps1 -Ref <codice-versione>
```
Il codice della versione precedente lo stampa lo script alla fine di ogni aggiornamento (o si trova nella cronologia di GitHub).

---

## Procedura di Deploy (metodo manuale, dal PC di sviluppo)

### Fase A — Sul PC di sviluppo

```powershell
# Nella cartella del progetto, lancia:
.\deploy.ps1
```

Questo script:
- Fa il build del frontend React
- Copia il build dentro il backend (`backend/public/`)
- Fa il build del backend NestJS
- Prepara una cartella `_deploy/` con tutto il necessario

### Fase B — Copia sul server

Copia l'intera cartella `_deploy/` sul server, ad esempio in:
```
C:\GestionaleCorreire\
```

Puoi usare una chiavetta USB, una cartella condivisa in rete, o RDP copia-incolla.

### Fase C — Modifica il file .env sul server

Apri `C:\GestionaleCorreire\.env` con Notepad e imposta i valori reali:

```env
DATABASE_URL=postgresql://postgres:LA_TUA_PASSWORD_POSTGRES@localhost:5432/gestionale_corriere?schema=public
JWT_SECRET=una_stringa_casuale_lunga_almeno_32_caratteri
PORT=3001
NODE_ENV=production
FRONTEND_URL=http://localhost:3001
```

> **Suggerimento JWT_SECRET**: genera una stringa casuale con PowerShell:
> ```powershell
> [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
> ```

### Fase D — Setup del servizio sul server

Apri PowerShell **come Amministratore** e lancia:

```powershell
cd C:\GestionaleCorreire
.\setup-server.ps1
```

Questo script:
- Applica le migration al database (crea le tabelle)
- Registra l'applicazione come servizio Windows con NSSM
- Avvia il servizio automaticamente

---

## Verifica che funzioni

Apri il browser sul server o da un altro PC della rete interna:
```
http://IP_DEL_SERVER:3001
```

Credenziali default:
- Email: `admin@gestionale.it`
- Password: `admin123`

**Cambia la password admin subito dopo il primo accesso!**

---

## Comandi utili sul server

```powershell
# Stato del servizio
Get-Service -Name GestionaleCorreire

# Avvia / Ferma / Riavvia
nssm start   GestionaleCorreire
nssm stop    GestionaleCorreire
nssm restart GestionaleCorreire

# Log in tempo reale
Get-Content C:\GestionaleCorreire\logs\stdout.log -Wait -Tail 50
Get-Content C:\GestionaleCorreire\logs\stderr.log -Wait -Tail 50
```

---

## Aggiornamenti futuri

Per aggiornare l'applicazione:

1. Sul PC di sviluppo: `.\deploy.ps1`
2. Copia la nuova cartella `_deploy/` sul server (sovrascrivendo)
3. Sul server:
```powershell
nssm stop GestionaleCorreire
# Copia i nuovi file...
# Esegui di nuovo setup-server.ps1 oppure:
cd C:\GestionaleCorreire
node_modules\.bin\prisma.cmd migrate deploy --schema=prisma\schema.prisma
nssm start GestionaleCorreire
```

---

## Porte in uso

| Servizio | Porta |
|---|---|
| Visualizzatore (MonitorPDX) | 9007 |
| Gestionale Corriere | 3001 |
| PostgreSQL | 5432 (solo locale) |
