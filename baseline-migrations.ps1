# ============================================================
# baseline-migrations.ps1
# Eseguire SUL SERVER una sola volta per allineare la
# cronologia migration di Prisma con il DB gia' esistente.
# ============================================================

$ErrorActionPreference = "Stop"
$AppDir  = "C:\GestionaleCorriere"
$prisma  = "$AppDir\node_modules\.bin\prisma.cmd"
$schema  = "--schema=$AppDir\prisma\schema.prisma"

# Carica .env
Get-Content "$AppDir\.env" | ForEach-Object {
    if ($_ -match "^([^#][^=]*)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

Write-Host "Allineamento cronologia migration Prisma..." -ForegroundColor Cyan
Write-Host ""

# Se c'e' una migration in stato FAILED, prima la risolve come "rolled-back"
# (cosi' Prisma non e' bloccato)
Write-Host "Risolvo eventuali migration in stato FAILED..." -ForegroundColor Yellow
& $prisma migrate resolve --rolled-back 20260331154514_add_tariffa_target_codice_autista $schema 2>$null
Write-Host ""

# Lista completa delle migration da marcare come gia' applicate
$migrations = @(
    "20260331154514_add_tariffa_target_codice_autista",
    "20260402091034_add_ricariche_fields",
    "20260402091707_add_maggiorazione_to_mezzo",
    "20260402132233_add_dvr_esente",
    "20260408000000_add_diesel_metano_alimentazione",
    "20260408120000_add_autovettura_semirimorchio_tipo_mezzo",
    "20260408150545_add_diesel_metano_alimentazione",
    "20260408150653_add_diesel_metano_alimentazione",
    "20260413100000_add_utilizzatore_to_mezzo",
    "20260413110000_audit_log_userid_nullable",
    "20260415120000_add_distribuzione_json_to_conteggio",
    "20260415140000_add_bonus_malus_zone_to_codice_autista",
    "20260415150000_add_codice_associato_to_palmare",
    "20260415160000_bonus_malus_to_text",
    "20260420100000_add_voci_conteggio",
    "20260421100000_add_perc_iva_to_conteggi_righe",
    "20260424100000_add_netto_salvato_to_conteggio",
    "20260612100000_add_documenti",
    "20260612110000_add_manutenzioni"
)

foreach ($m in $migrations) {
    Write-Host "  Marking applied: $m" -ForegroundColor Gray
    & $prisma migrate resolve --applied $m $schema 2>&1 | Out-Null
}

Write-Host ""
Write-Host "Verifica stato migration:" -ForegroundColor Cyan
& $prisma migrate status $schema

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  Baseline completato!" -ForegroundColor Green
Write-Host "  Ora puoi rieseguire update-server.ps1" -ForegroundColor White
Write-Host "======================================" -ForegroundColor Green
