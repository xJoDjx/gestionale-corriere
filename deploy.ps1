# ============================================================
# deploy.ps1  -  Gestionale Corriere
# Eseguire sul PC di sviluppo PRIMA di copiare sul server
# ============================================================

param(
    [string]$ServerPath = "C:\GestionaleCorriere"   # cartella di destinazione sul server
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  GESTIONALE CORRIERE - Build Deploy  " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$Root = $PSScriptRoot

# Ferma lo script se l'ultimo comando esterno (npm, npx...) e' fallito.
# ($ErrorActionPreference = "Stop" NON intercetta gli exit code dei programmi esterni,
#  quindi senza questo controllo un build fallito veniva ignorato e si copiava il vecchio dist.)
function Assert-LastExit([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "ERRORE: '$Step' e' fallito (exit code $LASTEXITCODE). Deploy interrotto, _deploy NON e' stato aggiornato." -ForegroundColor Red
        exit 1
    }
}

# ── 1. Build Frontend ─────────────────────────────────────
Write-Host "[1/4] Build Frontend..." -ForegroundColor Yellow
Set-Location "$Root\frontend"
$FrontendBuildStart = Get-Date
npm install --legacy-peer-deps
Assert-LastExit "npm install (frontend)"
npm run build
Assert-LastExit "npm run build (frontend)"
if (-not (Test-Path "$Root\frontend\dist\index.html")) {
    Write-Error "Build frontend fallita: dist\index.html non trovato."
}
if ((Get-Item "$Root\frontend\dist\index.html").LastWriteTime -lt $FrontendBuildStart) {
    Write-Error "Build frontend non aggiornata: dist\index.html e' piu' vecchio di questo build (si userebbe un frontend vecchio)."
}
Write-Host "      Frontend build OK" -ForegroundColor Green

# ── 2. Copia dist → backend/public ───────────────────────
Write-Host "[2/4] Copia frontend nel backend..." -ForegroundColor Yellow
$PublicDest = "$Root\backend\public"
if (Test-Path $PublicDest) { Remove-Item $PublicDest -Recurse -Force }
Copy-Item "$Root\frontend\dist" $PublicDest -Recurse
Write-Host "      Copia OK" -ForegroundColor Green

# ── 3. Build Backend ──────────────────────────────────────
Write-Host "[3/5] Build Backend..." -ForegroundColor Yellow
Set-Location "$Root\backend"
npm install --legacy-peer-deps
Assert-LastExit "npm install (backend)"
npm run build
Assert-LastExit "npm run build (backend)"
if (-not (Test-Path "$Root\backend\dist\main.js")) {
    Write-Error "Build backend fallita: dist/main.js non trovato."
}
Write-Host "      Backend build OK" -ForegroundColor Green

# ── 4. Genera client Prisma sul PC di sviluppo ────────────
Write-Host "[4/5] Generazione client Prisma..." -ForegroundColor Yellow
Set-Location "$Root\backend"
npx prisma generate
Assert-LastExit "npx prisma generate"
if (-not (Test-Path "$Root\backend\node_modules\@prisma\client")) {
    Write-Error "Prisma generate fallito: cartella @prisma/client non trovata."
}
Write-Host "      Prisma generate OK" -ForegroundColor Green

# ── 5. Prepara cartella di deploy ─────────────────────────
Write-Host "[5/5] Preparazione pacchetto di deploy..." -ForegroundColor Yellow
$DeployDir = "$Root\_deploy"
if (Test-Path $DeployDir) { Remove-Item $DeployDir -Recurse -Force }
New-Item -ItemType Directory $DeployDir | Out-Null

# Copia solo quello che serve in produzione
Copy-Item "$Root\backend\dist"            "$DeployDir\dist"            -Recurse
Copy-Item "$Root\backend\public"          "$DeployDir\public"          -Recurse
Copy-Item "$Root\backend\package.json"    "$DeployDir\package.json"
Copy-Item "$Root\backend\package-lock.json" "$DeployDir\package-lock.json" -ErrorAction SilentlyContinue

# Copia i template .docx dei contratti (letti a runtime da <root>/templates)
if (Test-Path "$Root\backend\templates") {
    Copy-Item "$Root\backend\templates" "$DeployDir\templates" -Recurse
    Write-Host "      Cartella templates inclusa nel pacchetto" -ForegroundColor Green
} else {
    Write-Host "      ATTENZIONE: backend\templates non trovata, i contratti .docx non funzioneranno" -ForegroundColor Red
}

# Copia il client Prisma pre-generato in cartella separata (npm install lo sovrascrive, viene ripristinato da update-server.ps1)
New-Item -ItemType Directory "$DeployDir\prisma-client-generated" | Out-Null
Copy-Item "$Root\backend\node_modules\@prisma\client\*" "$DeployDir\prisma-client-generated\" -Recurse
Write-Host "      @prisma/client pre-generato incluso nel pacchetto" -ForegroundColor Green

# Copia lo schema Prisma e le migration
New-Item -ItemType Directory "$DeployDir\prisma" | Out-Null
Copy-Item "$Root\backend\prisma\schema.prisma" "$DeployDir\prisma\schema.prisma"

if (Test-Path "$Root\backend\prisma\migrations") {
    Copy-Item "$Root\backend\prisma\migrations" "$DeployDir\prisma\migrations" -Recurse
}

# Il file .env NON viene incluso nel pacchetto di deploy:
# il server ha già il suo .env con le credenziali reali e non va sovrascritto.
# Se è il primo setup, usa setup-server.ps1 che crea il .env sul server.

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Build completata!" -ForegroundColor Green
Write-Host ""
Write-Host "  Cartella pronta: $DeployDir" -ForegroundColor White
Write-Host ""
Write-Host "  PROSSIMI PASSI:" -ForegroundColor Yellow
Write-Host "  1. Copia il CONTENUTO di _deploy sul server in C:\GestionaleCorriere" -ForegroundColor White
Write-Host "     ATTENZIONE: NON sovrascrivere il file .env del server!" -ForegroundColor Red
Write-Host "  2. Sul server esegui: update-server.ps1" -ForegroundColor White
Write-Host "======================================" -ForegroundColor Cyan
