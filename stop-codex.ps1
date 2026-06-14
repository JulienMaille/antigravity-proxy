#Requires -Version 5.1

<#
.SYNOPSIS
  Antigravity Proxy — Codex Cleanup.
.DESCRIPTION
  Reverts the changes made by start-codex.ps1:
  — Removes OPENAI_BASE_URL env var
  — Removes the antigravity provider section from Codex CLI config.toml
  — Removes the Codex model catalog
  — Optionally stops the proxy process
#>

param(
  [switch]$KillProxy
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $PSCommandPath
$ProxyDir = Join-Path $ScriptDir 'proxy'
$ProxyPort = 4000

function Write-Info  { Write-Host "  $args" -Foreground Cyan }
function Write-Ok    { Write-Host "  OK $args" -Foreground Green }
function Write-Warn  { Write-Host "  !! $args" -Foreground Yellow }
function Write-Err   { Write-Host "  XX $args" -Foreground Red }
function Write-Step  { Write-Host "`n==> $args" -Foreground Magenta }

# -- 1. Unset OPENAI_BASE_URL ---------------------------------------------------
Write-Step "Restoring environment"
if ($env:OPENAI_BASE_URL) {
  Remove-Item Env:OPENAI_BASE_URL -ErrorAction SilentlyContinue
  Write-Ok "Unset OPENAI_BASE_URL (was $env:OPENAI_BASE_URL)"
} else {
  Write-Info "OPENAI_BASE_URL was not set"
}

# -- 2. Remove antigravity provider from Codex CLI config -----------------------
Write-Step "Restoring Codex CLI config.toml"
$codexConfigFile = Join-Path (Join-Path $env:USERPROFILE ".codex") "config.toml"
if (Test-Path $codexConfigFile) {
  $content = Get-Content -Path $codexConfigFile -Raw
  $originalLen = $content.Length
  $content = $content -replace '(?ms)^\[model_providers\.antigravity\].*?(?=^\[|\z)', ''
  $content = $content -replace "`r?`n`r?`n+", "`r`n"
  $content = $content.Trim()
  if ($content.Length -ne $originalLen) {
    Set-Content -Path $codexConfigFile -Value $content -NoNewline
    Write-Ok "Removed antigravity provider section from config.toml"
  } else {
    Write-Info "No antigravity provider section found in config.toml"
  }
} else {
  Write-Info "No config.toml found at $codexConfigFile"
}

# -- 3. Remove Codex model catalog ----------------------------------------------
Write-Step "Removing Codex model catalog"
$catalogDir = Join-Path $env:USERPROFILE ".antigravity"
$catalogFile = Join-Path $catalogDir "codex-models.json"
if (Test-Path $catalogFile) {
  Remove-Item -Path $catalogFile -Force
  Write-Ok "Removed $catalogFile"
} else {
  Write-Info "No model catalog found at $catalogFile"
}

# -- 4. Optionally kill the proxy -----------------------------------------------
Write-Step "Proxy process"
$conn = Get-NetTCPConnection -LocalPort $ProxyPort -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen'
if ($conn) {
  $procId = $conn.OwningProcess
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Info "Proxy running on port $ProxyPort (PID $procId)"
    if ($KillProxy) {
      Stop-Process -Id $procId -Force
      Write-Ok "Proxy (PID $procId) stopped"
    } else {
      Write-Warn "Proxy still running. Re-run with -KillProxy to stop it."
    }
  }
} else {
  Write-Info "No process listening on port $ProxyPort"
}

Write-Step "Done"
