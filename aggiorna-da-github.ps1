# ============================================================
# aggiorna-da-github.ps1  -  Gestionale Corriere
#
# Da eseguire SUL SERVER, in PowerShell come Amministratore.
# Scarica da GitHub la versione pubblicata (ramo main), la compila
# in una cartella separata e aggiorna il gestionale in produzione.
#
# Sul server va esattamente quello che c'e' su GitHub: niente file
# locali, niente modifiche non salvate.
#
# Uso:
#   .\aggiorna-da-github.ps1                 # ultima versione di main
#   .\aggiorna-da-github.ps1 -Ref a1b2c3d    # una versione precisa (es. per tornare indietro)
#
# Requisiti sul server: Git per Windows, Node.js, NSSM, PostgreSQL.
# ============================================================

param(
    [string]$Ref         = "main",
    [string]$RepoUrl     = "https://github.com/xJoDjx/gestionale-corriere.git",
    [string]$SrcDir      = "C:\GestionaleCorriere-sorgente",
    [string]$AppDir      = "C:\GestionaleCorriere",
    [string]$BackupDir   = "C:\GestionaleCorriere-backup",
    [string]$ServiceName = "GestionaleCorriere"
)

$ErrorActionPreference = "Stop"

function Titolo([string]$t) { Write-Host ""; Write-Host $t -ForegroundColor Yellow }
function Ok([string]$t)     { Write-Host "      $t" -ForegroundColor Green }
function Stop-Con([string]$t) {
    Write-Host ""
    Write-Host "ERRORE: $t" -ForegroundColor Red
    Write-Host "Il gestionale in produzione NON e' stato toccato (o e' stato rimesso in funzione)." -ForegroundColor Red
    exit 1
}
function Assert-Exit([string]$passo) {
    if ($LASTEXITCODE -ne 0) { Stop-Con "'$passo' e' fallito (exit code $LASTEXITCODE)." }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  GESTIONALE CORRIERE - Aggiornamento da GitHub" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# -- 0. Controlli preliminari ----------------------------------
Titolo "[0/7] Controlli..."
foreach ($cmd in @("git", "node", "npm", "nssm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Stop-Con "'$cmd' non trovato. Installalo o aggiungilo al PATH." }
}
if (-not (Test-Path "$AppDir\.env")) { Stop-Con "File $AppDir\.env non trovato." }
if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) { Stop-Con "Servizio '$ServiceName' non trovato (controlla con: Get-Service *Gestionale*)." }

# Variabili del .env di produzione nel processo (servono a Prisma e al backup)
$Conf = @{}
Get-Content "$AppDir\.env" | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        $k = $matches[1].Trim(); $v = $matches[2].Trim().Trim('"')
        $Conf[$k] = $v
        [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
}
if (-not $Conf["DATABASE_URL"]) { Stop-Con "DATABASE_URL mancante nel .env di produzione." }
Ok "Strumenti e configurazione OK"

# -- 1. Scarica il codice da GitHub ----------------------------
Titolo "[1/7] Scarico il codice da GitHub ($Ref)..."
if (-not (Test-Path "$SrcDir\.git")) {
    git clone $RepoUrl $SrcDir
    Assert-Exit "git clone"
}
Set-Location $SrcDir
git fetch --all --tags --prune
Assert-Exit "git fetch"
# Porta la cartella esattamente alla versione richiesta, scartando qualsiasi file locale
$target = $Ref
git rev-parse --verify --quiet "origin/$Ref" | Out-Null
if ($LASTEXITCODE -eq 0) { $target = "origin/$Ref" }
git reset --hard $target
Assert-Exit "git reset --hard $target"
git clean -fd
Assert-Exit "git clean"
$Commit = (git rev-parse --short HEAD).Trim()
$Messaggio = (git log -1 --pretty=%s).Trim()
Ok "Versione: $Commit - $Messaggio"

$Precedente = ""
if (Test-Path "$AppDir\VERSIONE.txt") { $Precedente = (Get-Content "$AppDir\VERSIONE.txt" -First 1).Trim() }
if ($Precedente) { Write-Host "      In produzione adesso: $Precedente" -ForegroundColor Gray }

# -- 2. Compila frontend e backend (il servizio e' ancora acceso) -
Titolo "[2/7] Compilo il frontend..."
# Il .env di produzione imposta NODE_ENV=production: per compilare servono anche
# i pacchetti di sviluppo (tsc, vite, nest), quindi lo togliamo solo per la build.
$NodeEnvProd = $env:NODE_ENV
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
Set-Location "$SrcDir\frontend"
npm ci --include=dev --legacy-peer-deps
Assert-Exit "npm ci (frontend)"
npm run build
Assert-Exit "npm run build (frontend)"
if (-not (Test-Path "$SrcDir\frontend\dist\index.html")) { Stop-Con "Build frontend senza dist\index.html." }
Ok "Frontend OK"

Titolo "[3/7] Compilo il backend..."
Set-Location "$SrcDir\backend"
npm ci --include=dev --legacy-peer-deps
Assert-Exit "npm ci (backend)"
npx prisma generate
Assert-Exit "prisma generate"
npm run build
Assert-Exit "npm run build (backend)"
if (-not (Test-Path "$SrcDir\backend\dist\main.js")) { Stop-Con "Build backend senza dist\main.js." }
Ok "Backend OK"
if ($NodeEnvProd) { $env:NODE_ENV = $NodeEnvProd }

# -- 3. Backup: database e versione attuale --------------------
Titolo "[4/7] Backup del database e dei file attuali..."
$Stamp = Get-Date -Format "yyyyMMdd-HHmm"
$Dest = Join-Path $BackupDir $Stamp
New-Item -ItemType Directory $Dest -Force | Out-Null

$PgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
          Sort-Object FullName -Descending | Select-Object -First 1
if (-not $PgDump) { Stop-Con "pg_dump.exe non trovato in C:\Program Files\PostgreSQL. Backup impossibile: aggiornamento annullato." }
# pg_dump non accetta il parametro ?schema=... di Prisma
$DbUrl = ($Conf["DATABASE_URL"] -split '\?')[0]
& $PgDump.FullName --format=custom --file="$Dest\database.dump" --dbname="$DbUrl"
Assert-Exit "pg_dump"
Ok "Database salvato in $Dest\database.dump"

foreach ($d in @("dist", "public", "prisma", "templates")) {
    if (Test-Path "$AppDir\$d") { Copy-Item "$AppDir\$d" "$Dest\$d" -Recurse }
}
foreach ($f in @("package.json", "package-lock.json", "VERSIONE.txt")) {
    if (Test-Path "$AppDir\$f") { Copy-Item "$AppDir\$f" "$Dest\$f" }
}
Ok "File della versione attuale salvati in $Dest"

# -- 4. Ferma il servizio e sostituisce i file -----------------
Titolo "[5/7] Fermo il servizio e copio la nuova versione..."
nssm stop $ServiceName | Out-Null
Start-Sleep -Seconds 3

function Ripristina {
    Write-Host "      Ripristino la versione precedente..." -ForegroundColor Red
    foreach ($d in @("dist", "public", "prisma", "templates")) {
        if (Test-Path "$Dest\$d") {
            if (Test-Path "$AppDir\$d") { Remove-Item "$AppDir\$d" -Recurse -Force }
            Copy-Item "$Dest\$d" "$AppDir\$d" -Recurse
        }
    }
    foreach ($f in @("package.json", "package-lock.json")) { if (Test-Path "$Dest\$f") { Copy-Item "$Dest\$f" "$AppDir\$f" -Force } }
    Set-Location $AppDir
    npm install --omit=dev --legacy-peer-deps | Out-Null
    & "$AppDir\node_modules\.bin\prisma.cmd" generate --schema="$AppDir\prisma\schema.prisma" | Out-Null
    nssm start $ServiceName | Out-Null
}

try {
    foreach ($d in @("dist", "public", "prisma")) {
        if (Test-Path "$AppDir\$d") { Remove-Item "$AppDir\$d" -Recurse -Force }
    }
    Copy-Item "$SrcDir\backend\dist"   "$AppDir\dist"   -Recurse
    Copy-Item "$SrcDir\frontend\dist"  "$AppDir\public" -Recurse
    New-Item -ItemType Directory "$AppDir\prisma" | Out-Null
    Copy-Item "$SrcDir\backend\prisma\schema.prisma" "$AppDir\prisma\schema.prisma"
    if (Test-Path "$SrcDir\backend\prisma\migrations") {
        Copy-Item "$SrcDir\backend\prisma\migrations" "$AppDir\prisma\migrations" -Recurse
    }
    if (Test-Path "$SrcDir\backend\templates") {
        if (Test-Path "$AppDir\templates") { Remove-Item "$AppDir\templates" -Recurse -Force }
        Copy-Item "$SrcDir\backend\templates" "$AppDir\templates" -Recurse
    }
    Copy-Item "$SrcDir\backend\package.json"      "$AppDir\package.json" -Force
    Copy-Item "$SrcDir\backend\package-lock.json" "$AppDir\package-lock.json" -Force
    Ok "File copiati (.env, uploads e log non toccati)"

    # -- 5. Dipendenze, client Prisma e migrazioni -------------
    Titolo "[6/7] Dipendenze e database..."
    Set-Location $AppDir
    npm install --omit=dev --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { throw "npm install fallito" }
    # Il client Prisma va generato QUI, nella cartella di produzione: e' lui che legge
    # il .env di $AppDir all'avvio (DATABASE_URL, JWT_SECRET, PORT...). Un client generato
    # nella cartella sorgente cercherebbe il .env li' e il servizio non partirebbe.
    & "$AppDir\node_modules\.bin\prisma.cmd" generate --schema="$AppDir\prisma\schema.prisma"
    if ($LASTEXITCODE -ne 0) { throw "prisma generate fallito" }
    & "$AppDir\node_modules\.bin\prisma.cmd" migrate deploy --schema="$AppDir\prisma\schema.prisma"
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy fallito" }
    Ok "Dipendenze e migrazioni OK"
}
catch {
    Write-Host "ERRORE durante l'aggiornamento: $($_.Exception.Message)" -ForegroundColor Red
    Ripristina
    Stop-Con "Aggiornamento annullato. Se una migrazione era partita, il database si ripristina da $Dest\database.dump."
}

# -- 6. Riavvio e verifica -------------------------------------
Titolo "[7/7] Avvio il servizio..."
nssm start $ServiceName | Out-Null
$Porta = if ($Conf["PORT"]) { $Conf["PORT"] } else { "3001" }
$Risponde = $false
for ($i = 0; $i -lt 20 -and -not $Risponde; $i++) {
    Start-Sleep -Seconds 2
    try {
        Invoke-WebRequest -Uri "http://localhost:$Porta/" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $Risponde = $true
    } catch { }
}
if (-not $Risponde) {
    Write-Host "      Il gestionale non risponde sulla porta $Porta." -ForegroundColor Red
    nssm stop $ServiceName | Out-Null
    Ripristina
    Stop-Con "La nuova versione non parte: rimessa la precedente. Guarda i log in $AppDir\logs."
}

"$Commit - $Messaggio - aggiornato il $(Get-Date -Format 'dd/MM/yyyy HH:mm')" | Set-Content "$AppDir\VERSIONE.txt"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Aggiornamento completato: $Commit" -ForegroundColor Green
Write-Host "  $Messaggio" -ForegroundColor White
Write-Host ""
Write-Host "  Backup in: $Dest" -ForegroundColor Gray
if ($Precedente) {
    $PrecCommit = ($Precedente -split ' ')[0]
    Write-Host "  Per tornare alla versione precedente:" -ForegroundColor Gray
    Write-Host "    .\aggiorna-da-github.ps1 -Ref $PrecCommit" -ForegroundColor Gray
}
Write-Host "  Nel browser premi Ctrl+F5 per caricare la grafica nuova." -ForegroundColor Gray
Write-Host "==============================================" -ForegroundColor Cyan
