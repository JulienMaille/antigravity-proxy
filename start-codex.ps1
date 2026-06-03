#Requires -Version 5.1

<#
.SYNOPSIS
  Antigravity Proxy - Codex Launcher.
.DESCRIPTION
  Configures the OpenAI Codex app to route through the local proxy,
  ensures the proxy is running, and launches the Codex Windows App.
#>

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $PSCommandPath

# -- Color helpers ------------------------------------------------------------
function Write-Info  { Write-Host "  $args" -Foreground Cyan }
function Write-Ok    { Write-Host "  OK $args" -Foreground Green }
function Write-Warn  { Write-Host "  !! $args" -Foreground Yellow }
function Write-Err   { Write-Host "  XX $args" -Foreground Red }
function Write-Step  { Write-Host "`n==> $args" -Foreground Magenta }

# -- 1. Ensure Proxy is running -----------------------------------------------
Write-Step "Checking if Antigravity Proxy is running"
$proxyRunning = $false
try {
  $connection = Test-NetConnection -ComputerName localhost -Port 4000 -InformationLevel Quiet -ErrorAction SilentlyContinue
  if ($connection) {
    $proxyRunning = $true
  }
} catch {}

if (-not $proxyRunning) {
  Write-Warn "Antigravity Proxy is not running on port 4000."
  Write-Info "Starting proxy via start.ps1..."
  Start-Process powershell -Verb RunAs -ArgumentList "-File '$ScriptDir\start.ps1'"
  
  # Wait for proxy to spin up
  for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    $connection = Test-NetConnection -ComputerName localhost -Port 4000 -InformationLevel Quiet -ErrorAction SilentlyContinue
    if ($connection) {
      $proxyRunning = $true
      break
    }
  }
  if (-not $proxyRunning) {
    Write-Err "Could not start proxy. Please run start.ps1 manually and try again."
    exit 1
  }
}
Write-Ok "Antigravity Proxy is active on port 4000"

# -- 2. Configure Codex config.toml -------------------------------------------
Write-Step "Configuring Codex configuration file"
$configDir = Join-Path $env:USERPROFILE ".codex"
if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}
$configFile = Join-Path $configDir "config.toml"
$proxyBlock = @"

[model_providers.local-proxy]
name = "Antigravity Proxy"
base_url = "http://localhost:4000/v1"
wire_api = "responses"
"@

if (Test-Path $configFile) {
  $content = Get-Content -Path $configFile -Raw
  
  # Add the model provider block if it doesn't exist
  if ($content -notmatch '\[model_providers\.local-proxy\]') {
    Add-Content -Path $configFile -Value $proxyBlock
    Write-Ok "Added local-proxy definition to config.toml"
    $content = Get-Content -Path $configFile -Raw # Re-read
  } else {
    Write-Ok "local-proxy provider already defined in config.toml"
  }

  # Ensure default model provider is set to local-proxy
  if ($content -match 'model_provider\s*=') {
    $content = $content -replace 'model_provider\s*=\s*"[^"]*"', 'model_provider = "local-proxy"'
  } else {
    $content = "model_provider = `"local-proxy`"`r`n" + $content
  }

  # Ensure model is configured (default to deepseek-v4-flash-free if none set)
  if ($content -notmatch 'model\s*=') {
    $content = "model = `"deepseek-v4-flash-free`"`r`n" + $content
  }

  Set-Content -Path $configFile -Value $content -NoNewline
} else {
  $initialConfig = @"
model = "deepseek-v4-flash-free"
model_provider = "local-proxy"
$proxyBlock
"@
  Set-Content -Path $configFile -Value $initialConfig -NoNewline
  Write-Ok "Created new config.toml at $configFile"
}

# -- 3. Launch Codex with local proxy environment variables -------------------
Write-Step "Launching OpenAI Codex Desktop App"
$env:OPENAI_BASE_URL = "http://localhost:4000/v1"

try {
  # Try launching UWP/Store app protocol handler or execution alias
  Start-Process "codex:" -ErrorAction Stop
  Write-Ok "Codex Desktop App launched successfully!"
} catch {
  try {
    Start-Process "codex" -ErrorAction Stop
    Write-Ok "Codex Desktop App launched successfully!"
  } catch {
    Write-Warn "Could not launch Codex automatically. Please start it manually."
    Write-Info "Ensure that the OpenAI Codex Windows App is installed."
  }
}
