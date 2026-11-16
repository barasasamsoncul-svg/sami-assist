$ErrorActionPreference = 'Stop'

$runnerRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $runnerRoot 'package.json'))) {
    throw 'Run this script from the apps/runner directory.'
}

$relativeFiles = @(
    'app/(app)/index.tsx',
    'app/(auth)/document/[key].tsx',
    'app/(auth)/documents.tsx',
    'app/(auth)/login.tsx',
    'app/(auth)/register.tsx',
    'app/(auth)/tasks.tsx',
    'app/(auth)/verify.tsx',
    'app/_layout.tsx'
)

foreach ($relativePath in $relativeFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $runnerRoot $relativePath))) {
        throw "Required source file not found: $relativePath. No files have been changed."
    }
}

$backupRoot = Join-Path $env:TEMP ("sami-runner-sdk58-source-backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

foreach ($relativePath in $relativeFiles) {
    $sourcePath = Join-Path $runnerRoot $relativePath
    $backupPath = Join-Path $backupRoot $relativePath
    $backupDirectory = Split-Path -Parent $backupPath
    New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $backupPath
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$updatedFiles = New-Object System.Collections.Generic.List[string]

function Write-UpdatedFile {
    param(
        [string]$RelativePath,
        [string]$Content
    )
    $fullPath = Join-Path $runnerRoot $RelativePath
    [System.IO.File]::WriteAllText($fullPath, $Content, $utf8NoBom)
    if (-not $updatedFiles.Contains($RelativePath)) {
        $updatedFiles.Add($RelativePath)
    }
}

# React Native 0.88 removed backgroundColor and translucent from its StatusBar component.
# Remove only those props from StatusBar tags; keep barStyle and all screen/layout styles.
foreach ($relativePath in $relativeFiles) {
    $fullPath = Join-Path $runnerRoot $relativePath
    $content = [System.IO.File]::ReadAllText($fullPath)
    $original = $content

    $content = [regex]::Replace($content, '(?s)<StatusBar\b.*?/>', {
        param($match)
        $tag = $match.Value
        $tag = [regex]::Replace(
            $tag,
            '\s+backgroundColor\s*=\s*(?:\{[^}]*\}|"[^"]*"|''[^'']*'')',
            ''
        )
        $tag = [regex]::Replace(
            $tag,
            '\s+translucent(?:\s*=\s*(?:\{[^}]*\}|"[^"]*"|''[^'']*''))?',
            ''
        )
        return $tag
    })

    if ($content -ne $original) {
        Write-UpdatedFile -RelativePath $relativePath -Content $content
    }
}

# Add strict native-instance type imports and update the affected refs.
$loginPath = 'app/(auth)/login.tsx'
$content = [System.IO.File]::ReadAllText((Join-Path $runnerRoot $loginPath))
if ($content -notmatch 'import\s+type\s+\{[^}]*TextInputInstance') {
    $newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
    $reactImport = 'import { useEffect, useRef, useState } from "react";'
    if (-not $content.Contains($reactImport)) {
        throw "Could not find the expected React import in $loginPath. No further files were changed."
    }
    $content = $content.Replace(
        $reactImport,
        $reactImport + $newline + $newline + 'import type { TextInputInstance } from "react-native";'
    )
}
$content = $content.Replace('useRef<TextInput | null>(null)', 'useRef<TextInputInstance | null>(null)')
Write-UpdatedFile -RelativePath $loginPath -Content $content

$registerPath = 'app/(auth)/register.tsx'
$content = [System.IO.File]::ReadAllText((Join-Path $runnerRoot $registerPath))
if ($content -notmatch 'import\s+type\s+\{[^}]*TextInputInstance') {
    $newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
    $oldTypeImport = 'import type {' + $newline + '  KeyboardTypeOptions,' + $newline + '  TextInputProps,' + $newline + '} from "react-native";'
    $newTypeImport = 'import type {' + $newline + '  KeyboardTypeOptions,' + $newline + '  TextInputProps,' + $newline + '  TextInputInstance,' + $newline + '} from "react-native";'
    if (-not $content.Contains($oldTypeImport)) {
        throw "Could not find the expected React Native type import in $registerPath. No further files were changed."
    }
    $content = $content.Replace($oldTypeImport, $newTypeImport)
}
$content = $content.Replace('React.RefObject<TextInput | null>', 'React.RefObject<TextInputInstance | null>')
Write-UpdatedFile -RelativePath $registerPath -Content $content

$tasksPath = 'app/(auth)/tasks.tsx'
$content = [System.IO.File]::ReadAllText((Join-Path $runnerRoot $tasksPath))
if ($content -notmatch 'import\s+type\s+\{[^}]*ScrollViewInstance') {
    $newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
    $reactImport = 'import { useCallback, useEffect, useRef, useState } from "react";'
    if (-not $content.Contains($reactImport)) {
        throw "Could not find the expected React import in $tasksPath. No further files were changed."
    }
    $content = $content.Replace(
        $reactImport,
        $reactImport + $newline + $newline + 'import type { ScrollViewInstance, TextInputInstance } from "react-native";'
    )
}
$content = $content.Replace('useRef<ScrollView>(null)', 'useRef<ScrollViewInstance | null>(null)')
$content = $content.Replace('useRef<TextInput>(null)', 'useRef<TextInputInstance | null>(null)')
Write-UpdatedFile -RelativePath $tasksPath -Content $content

$verifyPath = 'app/(auth)/verify.tsx'
$content = [System.IO.File]::ReadAllText((Join-Path $runnerRoot $verifyPath))
if ($content -notmatch 'import\s+type\s+\{[^}]*TextInputInstance') {
    $newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
    $reactImport = 'import { useEffect, useRef, useState } from "react";'
    if (-not $content.Contains($reactImport)) {
        throw "Could not find the expected React import in $verifyPath. No further files were changed."
    }
    $content = $content.Replace(
        $reactImport,
        $reactImport + $newline + $newline + 'import type { TextInputInstance } from "react-native";'
    )
}
$content = $content.Replace('useRef<TextInput>(null)', 'useRef<TextInputInstance | null>(null)')
Write-UpdatedFile -RelativePath $verifyPath -Content $content

# React Native 0.88 requires an explicit iteration count. -1 preserves the existing infinite pulse.
$dashboardPath = 'app/(app)/index.tsx'
$content = [System.IO.File]::ReadAllText((Join-Path $runnerRoot $dashboardPath))
$content = $content.Replace('{ resetBeforeIteration: true }', '{ iterations: -1, resetBeforeIteration: true }')
Write-UpdatedFile -RelativePath $dashboardPath -Content $content

# Verify deprecated StatusBar props were removed from every affected StatusBar tag.
$remainingDeprecated = New-Object System.Collections.Generic.List[string]
foreach ($relativePath in $relativeFiles) {
    $content = [System.IO.File]::ReadAllText((Join-Path $runnerRoot $relativePath))
    $statusBarMatches = [regex]::Matches($content, '(?s)<StatusBar\b.*?/>')
    foreach ($statusBarMatch in $statusBarMatches) {
        if ($statusBarMatch.Value -match '\b(backgroundColor|translucent)\b') {
            $remainingDeprecated.Add($relativePath)
        }
    }
}
if ($remainingDeprecated.Count -gt 0) {
    throw ("Deprecated StatusBar props remain in: " + ($remainingDeprecated -join ', ') + ". Original files are backed up at: $backupRoot")
}

Write-Host ''
Write-Host 'Runner SDK 58 source fixes applied.' -ForegroundColor Green
Write-Host "Backup folder: $backupRoot"
Write-Host ''
Write-Host 'Updated files:'
$updatedFiles | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" }
Write-Host ''
Write-Host 'Next run:'
Write-Host '  npx tsc --noEmit --pretty false'
Write-Host '  Write-Host "TypeScript exit code: $LASTEXITCODE"'
