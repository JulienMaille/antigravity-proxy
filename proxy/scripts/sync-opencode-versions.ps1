#Requires -Version 5.1

<#
.SYNOPSIS
    Fetches the latest opencode version numbers from GitHub and npm,
    then updates proxy/src/adapters/opencode.ts if they've changed.
.DESCRIPTION
    Reads three versions from the opencode repo + npm:
      - opencode CLI version   (packages/opencode/package.json)
      - bun runtime version    (root packageManager field)
      - @ai-sdk/provider-utils (npm registry, pinned version from opencode)
    Compares them against the hardcoded values in opencode.ts and updates
    if any differ. Exits 0 when up-to-date, 1 when changes were made.
.EXAMPLE
    .\sync-opencode-versions.ps1
#>

$ErrorActionPreference = 'Stop'

# ── Paths ──────────────────────────────────────────────────────────
$adapterFile = "$PSScriptRoot\..\src\adapters\opencode.ts"
$resolvedAdapter = (Resolve-Path $adapterFile).Path

# ── Fetch current versions from opencode source ────────────────────
Write-Host "Fetching versions from opencode GitHub + npm..." -ForegroundColor Cyan

$ocPkg = Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/package.json'
$newOcVersion = $ocPkg.version

$corePkg = Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/core/package.json'
$newProviderUtils = $corePkg.dependencies.'@ai-sdk/provider-utils'

$rootPkg = Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/anomalyco/opencode/dev/package.json'
$bunMatch = [regex]::Match($rootPkg.packageManager, 'bun@([\d.]+)')
$newBunVersion = $bunMatch.Groups[1].Value

Write-Host "  opencode CLI:      $newOcVersion"
Write-Host "  provider-utils:    $newProviderUtils"
Write-Host "  bun runtime:       $newBunVersion"

# ── Read current values from opencode.ts ───────────────────────────
$content = Get-Content -Path $resolvedAdapter -Raw

$currentOcMatch  = [regex]::Match($content, "const OC_VERSION = '([\d.]+)'")
$currentOc       = $currentOcMatch.Groups[1].Value

$currentUaMatch  = [regex]::Match($content, "provider-utils/([\d.]+)")
$currentProviderUtils = $currentUaMatch.Groups[1].Value

$currentBunMatch = [regex]::Match($content, "runtime/bun/([\d.]+)")
$currentBun      = $currentBunMatch.Groups[1].Value

Write-Host "`nCurrent values in opencode.ts:" -ForegroundColor Cyan
Write-Host "  opencode CLI:      $currentOc"
Write-Host "  provider-utils:    $currentProviderUtils"
Write-Host "  bun runtime:       $currentBun"

Write-Host "`nUpstream values:" -ForegroundColor Cyan
Write-Host "  opencode CLI:      $newOcVersion"
Write-Host "  provider-utils:    $newProviderUtils"
Write-Host "  bun runtime:       $newBunVersion"

# ── Compare and update ─────────────────────────────────────────────
$changed = $false

if ($currentOc -ne $newOcVersion) {
    Write-Host "  → Updating OC_VERSION: $currentOc → $newOcVersion" -ForegroundColor Yellow
    $content = $content -replace "const OC_VERSION = '[\d.]+'", "const OC_VERSION = '$newOcVersion'"
    $changed = $true
}

if ($currentProviderUtils -ne $newProviderUtils) {
    Write-Host "  → Updating provider-utils: $currentProviderUtils → $newProviderUtils" -ForegroundColor Yellow
    $content = $content -replace "provider-utils/[\d.]+", "provider-utils/$newProviderUtils"
    $changed = $true
}

if ($currentBun -ne $newBunVersion) {
    Write-Host "  → Updating bun runtime: $currentBun → $newBunVersion" -ForegroundColor Yellow
    $content = $content -replace "runtime/bun/[\d.]+", "runtime/bun/$newBunVersion"
    $changed = $true
}

if (-not $changed) {
    Write-Host "`nAll versions are up to date." -ForegroundColor Green
    exit 0
}

# ── Write updated file ─────────────────────────────────────────────
Set-Content -Path $resolvedAdapter -Value $content -NoNewline
Write-Host "`nUpdated $resolvedAdapter" -ForegroundColor Green
exit 1
