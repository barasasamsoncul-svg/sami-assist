$ErrorActionPreference = 'Stop'

# Run this script from: C:\dev\sami-assist-web\apps\mobile
$projectRoot = (Get-Location).Path
if ((Split-Path $projectRoot -Leaf) -ne 'mobile' -or (Split-Path (Split-Path $projectRoot -Parent) -Leaf) -ne 'apps') {
  throw "Run this script from the apps/mobile directory. Current directory: $projectRoot"
}

$relativeFiles = @(
  'app/(app)/account.tsx',
  'app/(app)/account/delete-account.tsx',
  'app/(app)/account/privacy.tsx',
  'app/(app)/account/profile.tsx',
  'app/(app)/account/sign-in.tsx',
  'app/(app)/account/support.tsx',
  'app/(app)/errand/[id]/call.tsx',
  'app/(app)/index.tsx',
  'app/(auth)/verify.tsx',
  'app/index.tsx'
)

$missing = @($relativeFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $projectRoot $_)) })
if ($missing.Count -gt 0) {
  throw "These expected files were not found:`n$($missing -join "`n")"
}

$backupRoot = Join-Path $env:TEMP ("sami-mobile-sdk58-statusbar-backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$changedFiles = New-Object System.Collections.Generic.List[string]

foreach ($relativePath in $relativeFiles) {
  $fullPath = Join-Path $projectRoot $relativePath
  $content = [System.IO.File]::ReadAllText($fullPath)

  # Back up the original file before making any change.
  $backupPath = Join-Path $backupRoot $relativePath
  $backupDirectory = Split-Path $backupPath -Parent
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  Copy-Item -LiteralPath $fullPath -Destination $backupPath -Force

  # React Native 0.88 removed these props from its StatusBar component.
  # Only transform StatusBar opening/self-closing tags; other screen styles remain untouched.
  $updated = [regex]::Replace($content, '(?s)<StatusBar\b.*?/>', {
    param($match)
    $tag = $match.Value
    $tag = [regex]::Replace($tag, '\s+translucent(?:\s*=\s*(?:\{[^}]*\}|"[^"]*"|''[^'']*''))?', '')
    $tag = [regex]::Replace($tag, '\s+backgroundColor\s*=\s*(?:\{[^}]*\}|"[^"]*"|''[^'']*'')', '')
    return $tag
  })

  if ($relativePath -eq 'app/(auth)/verify.tsx') {
    # Add the SDK 58 native instance types, retaining View/TextInput as runtime components.
    if ($updated -notmatch 'import type \{[^}]*\bViewInstance\b') {
      $updated = [regex]::Replace(
        $updated,
        '(?m)^import \{ useRef, useState \} from "react";\r?\n',
        ('$0' + 'import type { TextInputInstance, ViewInstance } from "react-native";' + "`r`n"),
        1
      )
    }

    $updated = $updated -replace 'useRef<View>\(null\)', 'useRef<ViewInstance>(null)'
    $updated = $updated -replace 'useRef<TextInput>\(null\)', 'useRef<TextInputInstance>(null)'
  }

  if ($updated -ne $content) {
    [System.IO.File]::WriteAllText($fullPath, $updated, $utf8NoBom)
    $changedFiles.Add($relativePath)
  }
}

Write-Host ''
Write-Host 'SDK 58 source fixes applied.' -ForegroundColor Green
Write-Host "Backup folder: $backupRoot"
Write-Host ''
if ($changedFiles.Count -gt 0) {
  Write-Host 'Updated files:'
  $changedFiles | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host 'No changes were necessary in the listed files.'
}
Write-Host ''
Write-Host 'Next run:' -ForegroundColor Cyan
Write-Host '  npm run typecheck -- --pretty false'
