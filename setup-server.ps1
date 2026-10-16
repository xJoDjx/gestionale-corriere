# ============================================================
# setup-server.ps1  -  Gestionale Corriere
# Eseguire SUL SERVER come Amministratore
# ============================================================
# Prerequisiti sul server:
#   - Node.js installato  (https://nodejs.org)
#   - NSSM installato     (https://nssm.cc)
#   - PostgreSQL installato e in esecuzione
# ============================================================

$ErrorActionPreference = "Stop"

# ── Configurazione ────────────────────────────────────────
$ServiceName  = "GestionaleCorriere"
$AppDir       = "C:\GestionaleCorriere"          # cartella dove hai copiato _deploy
$NodeExe      = "C:\Program Files\nodejs\node.exe"
$NssmExe      = "C:\Windows\System32\nssm.exe"        # adatta al tuo percorso NSSM
$LogDir       = "C:\GestionaleCorriere\logs"
# ─────────────────────────────────────────────────────────

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  GESTIONALE CORRIERE - Setup Server  " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Verifica .env
if (-not (Test-Path "$AppDir\.env")) {
    Write-Error "File .env non trovato in $AppDir. Crealo prima di eseguire questo script."
}

# Leggi .env per estrarre DATABASE_URL
$envContent = Get-Content "$AppDir\.env" | Where-Object { $_ -match "DATABASE_URL=" }
Write-Host "DATABASE_URL trovata nel .env" -ForegroundColor Green

# ── Crea cartella log ─────────────────────────────────────
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory $LogDir | Out-Null }

# ── Prisma: crea schema DB ────────────────────────────────
Write-Host ""
Write-Host "[1/3] Applicazione schema database (prisma migrate deploy)..." -ForegroundColor Yellow
Set-Location $AppDir

# Carica variabili .env per il processo corrente
Get-Content "$AppDir\.env" | ForEach-Object {
    if ($_ -match "^([^#][^=]*)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

# Installa dipendenze Node sul server (più affidabile che copiarle dal PC di sviluppo)
Write-Host "[1/4] Installazione dipendenze npm..." -ForegroundColor Yellow
Set-Location $AppDir
npm install --omit=dev
Write-Host "      npm install OK" -ForegroundColor Green

Write-Host ""
Write-Host "[2/4] Applicazione schema database (prisma migrate deploy)..." -ForegroundColor Yellow
& "$AppDir\node_modules\.bin\prisma.cmd" migrate deploy --schema="$AppDir\prisma\schema.prisma"
Write-Host "      Schema DB OK" -ForegroundColor Green

# ── Rimuovi servizio esistente (se presente) ──────────────
Write-Host ""
Write-Host "[3/4] Configurazione servizio NSSM..." -ForegroundColor Yellow
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "      Servizio esistente trovato, lo rimuovo..." -ForegroundColor Gray
    & $NssmExe stop $ServiceName
    & $NssmExe remove $ServiceName confirm
    Start-Sleep -Seconds 2
}

# ── Installa servizio NSSM ────────────────────────────────
& $NssmExe install $ServiceName $NodeExe "$AppDir\dist\main.js"
& $NssmExe set $ServiceName AppDirectory $AppDir
& $NssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production"
& $NssmExe set $ServiceName AppStdout "$LogDir\stdout.log"
& $NssmExe set $ServiceName AppStderr "$LogDir\stderr.log"
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateOnline 1
& $NssmExe set $ServiceName AppRotateBytes 10485760   # 10 MB
& $NssmExe set $ServiceName Start SERVICE_AUTO_START
& $NssmExe set $ServiceName DisplayName "Gestionale Corriere"
& $NssmExe set $ServiceName Description "Sistema gestionale per corriere - NestJS"

Write-Host "      Servizio NSSM configurato" -ForegroundColor Green

# ── Avvio servizio ────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Avvio servizio..." -ForegroundColor Yellow
& $NssmExe start $ServiceName
Start-Sleep -Seconds 3

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-Host "      Servizio avviato con successo!" -ForegroundColor Green
} else {
    Write-Host "      ATTENZIONE: verifica i log in $LogDir" -ForegroundColor Red
}

# Leggi porta dal .env
$portLine = Get-Content "$AppDir\.env" | Where-Object { $_ -match "^PORT=" }
$port = if ($portLine) { ($portLine -split "=")[1].Trim() } else { "3001" }

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Setup completato!" -ForegroundColor Green
Write-Host ""
Write-Host "  Applicazione disponibile su:" -ForegroundColor White
Write-Host "  http://localhost:$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Comandi utili:" -ForegroundColor White
Write-Host "  nssm start  $ServiceName" -ForegroundColor Gray
Write-Host "  nssm stop   $ServiceName" -ForegroundColor Gray
Write-Host "  nssm restart $ServiceName" -ForegroundColor Gray
Write-Host "  Log: $LogDir\stdout.log" -ForegroundColor Gray
Write-Host "======================================" -ForegroundColor Cyan
