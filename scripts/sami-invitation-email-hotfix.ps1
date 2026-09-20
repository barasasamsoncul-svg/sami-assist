param(
  [string]$ProjectRoot = "C:\dev\sami-assist-web"
)

$ErrorActionPreference = "Stop"

$target = Join-Path $ProjectRoot "app\api\workspace\invitations\route.ts"

if (-not (Test-Path $target)) {
    throw "SaMi invitation route not found: $target"
}

$raw = [System.IO.File]::ReadAllText($target)

# This hotfix is ONLY for the already-hardened compatibility route.
if (-not $raw.Contains("/api/workspace/invitations/create-with-access")) {
    throw "Canonical invitation redirect is missing. Refusing to patch a different route state."
}

$postMarker = "POST /api/workspace/invitations"
$patchMarker = "PATCH /api/workspace/invitations"

$postStart = $raw.IndexOf($postMarker, [System.StringComparison]::Ordinal)

if ($postStart -lt 0) {
    throw "Legacy invitation POST marker was not found."
}

$patchStart = $raw.IndexOf(
    $patchMarker,
    $postStart + $postMarker.Length,
    [System.StringComparison]::Ordinal
)

if ($patchStart -lt 0) {
    throw "Invitation PATCH marker was not found after the POST block."
}

$prefix = $raw.Substring(0, $postStart)
$postSection = $raw.Substring($postStart, $patchStart - $postStart)
$suffix = $raw.Substring($patchStart)

# If already fixed, do nothing.
$alreadyFixed = [regex]::IsMatch(
    $postSection,
    "email\s*:\s*\(\s*body\.email\s*\?\?\s*''\s*\)\s*,",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
)

if (-not $alreadyFixed) {
    # Scope the replacement to the legacy POST block only.
    # This exact expression is the TypeScript error source:
    #
    # email:
    #   typeof body.email ===
    #     'string'
    #     ? body.email
    #     : '',
    #
    # Replace with a guaranteed string while preserving the same
    # number of source lines.
    $pattern = "email:\r?\n([ \t]*)typeof body\.email ===\r?\n[ \t]*'string'\r?\n[ \t]*\? body\.email\r?\n[ \t]*: '',"

    $matches = [regex]::Matches(
        $postSection,
        $pattern,
        [System.Text.RegularExpressions.RegexOptions]::None
    )

    if ($matches.Count -ne 1) {
        throw "Expected exactly one legacy POST email expression, found $($matches.Count). Refusing an ambiguous change."
    }

    $newline = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
    $indent = $matches[0].Groups[1].Value

    $replacement =
        "email:" + $newline +
        $indent + "(" + $newline +
        $indent + "  body.email ??" + $newline +
        $indent + "  ''" + $newline +
        $indent + "),"

    $match = $matches[0]

    $postSection =
        $postSection.Substring(0, $match.Index) +
        $replacement +
        $postSection.Substring($match.Index + $match.Length)
}

$updated = $prefix + $postSection + $suffix

# Safety checks before writing.
if (-not $updated.Contains("/api/workspace/invitations/create-with-access")) {
    throw "Safety check failed: canonical invitation redirect disappeared."
}

if (-not [regex]::IsMatch(
    $postSection,
    "email\s*:\s*\(\s*body\.email\s*\?\?\s*''\s*\)\s*,",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
)) {
    throw "Safety check failed: normalized legacy email expression was not produced."
}

$beforeLines = ($raw -split "\r?\n").Count
$afterLines = ($updated -split "\r?\n").Count

if ($beforeLines -ne $afterLines) {
    throw "Safety check failed: route line count changed from $beforeLines to $afterLines."
}

$backupDir = Join-Path $ProjectRoot ".sami-backups\invitation-email-hotfix"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $backupDir "route-$timestamp.ts"

Copy-Item $target $backup -Force

# Preserve UTF-8 BOM state when present.
$bytes = [System.IO.File]::ReadAllBytes($target)
$hasUtf8Bom =
    $bytes.Length -ge 3 -and
    $bytes[0] -eq 0xEF -and
    $bytes[1] -eq 0xBB -and
    $bytes[2] -eq 0xBF

$encoding = New-Object System.Text.UTF8Encoding($hasUtf8Bom)
[System.IO.File]::WriteAllText($target, $updated, $encoding)

Write-Host ""
Write-Host "[SaMi] Invitation compatibility TypeScript hotfix applied safely." -ForegroundColor Green
Write-Host "[SaMi] Only app/api/workspace/invitations/route.ts was touched."
Write-Host "[SaMi] Route line count preserved: $afterLines"
Write-Host "[SaMi] Backup: $backup"
Write-Host ""
Write-Host "Next run:" -ForegroundColor Cyan
Write-Host "  npm run build"
Write-Host "  node --test tests/category-7-9-access-boundaries.test.mjs"
