param(
    [string]$ProjectRoot = "C:\dev\sami-assist-web",
    [switch]$SkipDatabase,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Step
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE. SaMi hardening stopped here."
    }
}

if (-not (Test-Path $ProjectRoot)) {
    throw "SaMi project was not found at $ProjectRoot"
}

Set-Location $ProjectRoot

Write-Host "`n=== SaMi Foundation Hardening v4 ===" -ForegroundColor Cyan

Write-Host "`n[1/4] Hardening large existing files..." -ForegroundColor Cyan
node scripts/apply-foundation-hardening.mjs
Assert-LastExitCode -Step "Foundation hardening patch"

if (-not $SkipDatabase) {
    Write-Host "`n[2/4] Repairing membership-loss session trigger..." -ForegroundColor Cyan
    npx tsx scripts/fix-category-7-membership-session-trigger.ts
    Assert-LastExitCode -Step "Session-trigger repair"

    Write-Host "`n[3/4] Ensuring Category 7-9 app-grant schema..." -ForegroundColor Cyan
    npx tsx scripts/migrate-category-7-9-app-grants.ts
    Assert-LastExitCode -Step "App-grant migration"
}
else {
    Write-Host "`n[2/4] Database changes skipped by request." -ForegroundColor Yellow
    Write-Host "[3/4] Database changes skipped by request." -ForegroundColor Yellow
}

if (-not $SkipBuild) {
    Write-Host "`n[4/4] Building SaMi..." -ForegroundColor Cyan
    npm run build
    Assert-LastExitCode -Step "SaMi build"

    Write-Host "`nRunning Categories 7-9 access-boundary regression tests..." -ForegroundColor Cyan
    node --test tests/category-7-9-access-boundaries.test.mjs
    Assert-LastExitCode -Step "Categories 7-9 authorization tests"
}
else {
    Write-Host "`n[4/4] Build/tests skipped by request." -ForegroundColor Yellow
}

Write-Host "`nSaMi foundation hardening v4 completed." -ForegroundColor Green
