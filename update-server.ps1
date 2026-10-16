# ============================================================
# update-server.ps1  -  Gestionale Corriere
# Eseguire SUL SERVER come Amministratore per aggiornare
# un'installazione gia' esistente (NON il primo setup).
#
# Presuppone che la cartella _deploy sia gia' stata copiata
# in C:\GestionaleCorriere (sovrascrivendo i file precedenti).
# ============================================================

$ErrorActionPreference = "Stop"

$ServiceName = "GestionaleCorriere"
$AppDir      = "C:\GestionaleCorriere"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  GESTIONALE CORRIERE - Aggiornamento " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Verifica che .env esista
if (-not (Test-Path "$AppDir\.env")) {
    Write-Error "File .env non trovato in $AppDir."
}

# Carica variabili .env nel processo corrente (serve a Prisma)
Get-Content "$AppDir\.env" | ForEach-Object {
    if ($_ -match "^([^#][^=]*)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

# -- 0. Controllo integrita' dei file appena copiati, PRIMA di fermare il
#    servizio: se la copia di _deploy sul server e' andata storta (file
#    incompleti/sovrascritti male), meglio scoprirlo subito con un errore
#    chiaro piuttosto che fermare il servizio e poi non riuscire a
#    riavviarlo con npm/prisma che falliscono in modo criptico.
Write-Host "[1/8] Controllo integrita' file..." -ForegroundColor Yellow
try {
    Get-Content "$AppDir\package.json" -Raw | ConvertFrom-Json | Out-Null
} catch {
    Write-Error "package.json non e' JSON valido (copia da _deploy incompleta o sbagliata?). Ricopia _deploy\package.json sul server e riprova. Dettaglio: $($_.Exception.Message)"
}
$schemaContent = Get-Content "$AppDir\prisma\schema.prisma" -Raw
if ($schemaContent -notmatch 'datasource\s+\w+\s*\{') {
    Write-Error "prisma\schema.prisma non contiene un blocco datasource (copia da _deploy incompleta o sbagliata?). Ricopia l'intera cartella _deploy\prisma sul server e riprova."
}
if (-not (Test-Path "$AppDir\dist\main.js")) {
    Write-Error "dist\main.js non trovato: la copia di _deploy\dist sul server e' incompleta. Ricopia l'intera cartella _deploy sul server e riprova."
}
Write-Host "      File OK" -ForegroundColor Green

# -- 1. Ferma il servizio
Write-Host "[2/8] Fermo il servizio $ServiceName..." -ForegroundColor Yellow
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 3
    Write-Host "      Servizio fermato" -ForegroundColor Green
} else {
    Write-Host "      Servizio non trovato, continuo..." -ForegroundColor Gray
}

# -- 2. Installa/aggiorna dipendenze npm
Write-Host "[3/8] Aggiornamento dipendenze npm..." -ForegroundColor Yellow
Set-Location $AppDir
npm install --omit=dev
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install fallito (exit code $LASTEXITCODE). Il servizio resta fermo: correggi l'errore sopra e rilancia lo script."
}
Write-Host "      npm install OK" -ForegroundColor Green

# -- 3. Ripristina client Prisma pre-generato (npm install lo sovrascrive con versione non generata)
if (Test-Path "$AppDir\prisma-client-generated") {
    Write-Host "[4/8] Ripristino client Prisma pre-generato..." -ForegroundColor Yellow
    if (Test-Path "$AppDir\node_modules\@prisma\client") {
        Remove-Item "$AppDir\node_modules\@prisma\client" -Recurse -Force
    }
    New-Item -ItemType Directory "$AppDir\node_modules\@prisma\client" | Out-Null
    Copy-Item "$AppDir\prisma-client-generated\*" "$AppDir\node_modules\@prisma\client\" -Recurse
    Write-Host "      @prisma/client ripristinato" -ForegroundColor Green
} else {
    Write-Host "[4/8] Cartella prisma-client-generated non trovata, salto..." -ForegroundColor Gray
}

# -- 4. Applica le nuove migration al DB
Write-Host "[5/8] Applicazione migration database..." -ForegroundColor Yellow
& "$AppDir\node_modules\.bin\prisma.cmd" migrate deploy --schema="$AppDir\prisma\schema.prisma"
if ($LASTEXITCODE -ne 0) {
    Write-Error "prisma migrate deploy fallito (exit code $LASTEXITCODE). Il servizio resta fermo: correggi l'errore sopra (es. schema.prisma corrotto/incompleto) e rilancia lo script."
}
Write-Host "      Migration OK" -ForegroundColor Green

# -- 5. Rigenera il client Prisma (aggiorna i modelli nel client)
Write-Host "[6/8] Rigenerazione client Prisma..." -ForegroundColor Yellow
& "$AppDir\node_modules\.bin\prisma.cmd" generate --schema="$AppDir\prisma\schema.prisma"
if ($LASTEXITCODE -ne 0) {
    Write-Error "prisma generate fallito (exit code $LASTEXITCODE). Il servizio resta fermo: correggi l'errore sopra e rilancia lo script."
}
Write-Host "      Prisma generate OK" -ForegroundColor Green

# -- 6. Migrazione dati one-shot (idempotente, sicuro da rieseguire)
if (Test-Path "$AppDir\scripts\migrate-note-to-log.js") {
    Write-Host "[7/8] Esecuzione script migrazione dati..." -ForegroundColor Yellow
    node "$AppDir\scripts\migrate-note-to-log.js"
    Write-Host "      Migrazione completata" -ForegroundColor Green
}

# -- 7. Riavvia il servizio
Write-Host "[8/8] Riavvio servizio..." -ForegroundColor Yellow
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-Host "      Servizio avviato!" -ForegroundColor Green
} else {
    Write-Host "      ATTENZIONE: verifica i log in C:\GestionaleCorriere\logs" -ForegroundColor Red
}


Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Aggiornamento completato!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
