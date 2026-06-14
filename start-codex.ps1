#Requires -Version 5.1

<#
.SYNOPSIS
  Antigravity Proxy — Codex Launcher (v2).
.DESCRIPTION
  Configures the OpenAI Codex app (CLI & Desktop) to route through the local
  Antigravity proxy, ensures the proxy is running (starting it directly if
  needed), and launches the app.

  Does NOT call start.ps1 and does NOT launch the Antigravity desktop app.
#>

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $PSCommandPath
$ProxyDir = Join-Path $ScriptDir 'proxy'
$ProxyPort = 4000
$ProxyUrl = "http://127.0.0.1:$ProxyPort"

# -- Color helpers ------------------------------------------------------------
function Write-Info  { Write-Host "  $args" -Foreground Cyan }
function Write-Ok    { Write-Host "  OK $args" -Foreground Green }
function Write-Warn  { Write-Host "  !! $args" -Foreground Yellow }
function Write-Err   { Write-Host "  XX $args" -Foreground Red }
function Write-Step  { Write-Host "`n==> $args" -Foreground Magenta }

# -- 1. Check prerequisites (if we may need to start the proxy) ----------------
Write-Step "Checking prerequisites"
$node = Get-Command 'node' -ErrorAction SilentlyContinue
if (-not $node) { Write-Err "Node.js not found. Install from https://nodejs.org"; exit 1 }
$npm = Get-Command 'npm' -ErrorAction SilentlyContinue
if (-not $npm) { Write-Err "npm not found."; exit 1 }
Write-Ok "Node.js $($node.Version) / npm $(& $npm --version)"

# -- 2. Check if proxy is already running (HTTP-based health check) ------------
Write-Step "Checking if Antigravity Proxy is running"
$proxyRunning = $false
try {
  # HTTP GET to the dashboard / models endpoint — reliable application-level check
  $response = Invoke-WebRequest -Uri "$ProxyUrl/v1/models" -Method GET -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
  if ($response.StatusCode -eq 200) {
    $proxyRunning = $true
  }
} catch {}
# Fallback: TCP port check for cases where proxy is still starting
if (-not $proxyRunning) {
  try {
    $connection = Test-NetConnection -ComputerName localhost -Port $ProxyPort -InformationLevel Quiet -ErrorAction SilentlyContinue
    if ($connection) { $proxyRunning = $true }
  } catch {}
}

# -- 3. Start proxy directly if not running -----------------------------------
if (-not $proxyRunning) {
  Write-Warn "Antigravity Proxy is not running on port $ProxyPort."
  Write-Info "Starting proxy directly from $ProxyDir..."

  # Ensure node_modules exist
  if (-not (Test-Path (Join-Path $ProxyDir 'node_modules'))) {
    Write-Info "Installing dependencies..."
    Push-Location $ProxyDir
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed"; Pop-Location; exit 1 }
    Pop-Location
    Write-Ok "Dependencies installed"
  }

  # Generate TLS certificates if missing (proxy needs them for localhost:443)
  $certFile = Join-Path (Join-Path $ProxyDir 'certs') 'cert.pem'
  if (-not (Test-Path $certFile)) {
    Write-Info "Generating TLS certificates..."
    Push-Location $ProxyDir
    npx tsx scripts/gen-certs.mjs
    if ($LASTEXITCODE -ne 0) { Write-Err "Certificate generation failed"; Pop-Location; exit 1 }
    Pop-Location
    Write-Ok "Certificates generated"
  }

  # Start proxy in a new window (no admin needed for port 4000)
  $logDir = Join-Path $ProxyDir 'logs'
  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
  $logFile = Join-Path $logDir "codex_proxy_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
  $logArgs = @("-NoExit", "-Command", "cd '$ProxyDir'; npx tsx src/index.ts 2>&1 | Tee-Object -FilePath '$logFile'")

  try {
    $proc = Start-Process powershell -ArgumentList $logArgs -WindowStyle Normal -PassThru
    Write-Ok "Proxy starting (PID $($proc.Id)) — log: $logFile"
  } catch {
    Write-Err "Failed to start proxy: $_"
    exit 1
  }

  # Wait for proxy to respond (up to 20 seconds, HTTP-based check)
  Write-Info "Waiting for proxy to become ready..."
  $proxyReady = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-WebRequest -Uri "$ProxyUrl/v1/models" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
      if ($response.StatusCode -eq 200) {
        $proxyReady = $true
        break
      }
    } catch {}
    if ($i -eq 4 -or $i -eq 9 -or $i -eq 14) {
      Write-Info "  Still waiting... ($('{0}s' -f ($i+1)))"
    }
  }
  if (-not $proxyReady) {
    Write-Err "Proxy did not become ready within 20 seconds."
    Write-Err "Check the log file: $logFile"
    exit 1
  }
  Write-Ok "Proxy is ready"
} else {
  Write-Ok "Antigravity Proxy is already running on port $ProxyPort"
}

# -- 4. Configure Codex CLI (config.toml) ------------------------------------
Write-Step "Configuring Codex CLI config.toml"
$codexConfigDir = Join-Path $env:USERPROFILE ".codex"
if (-not (Test-Path $codexConfigDir)) {
  New-Item -ItemType Directory -Path $codexConfigDir -Force | Out-Null
}
$codexConfigFile = Join-Path $codexConfigDir "config.toml"

# Generate a model catalog JSON for Codex Desktop's model picker
Write-Step "Generating model catalog for Codex"
$codexModelsDir = Join-Path $env:USERPROFILE ".antigravity"
if (-not (Test-Path $codexModelsDir)) {
  New-Item -ItemType Directory -Path $codexModelsDir -Force | Out-Null
}
$catalogFile = Join-Path $codexModelsDir "codex-models.json"

$modelCatalog = @{
  models = @(
    @{ slug = "deepseek-v4-flash-free"; display_name = "DeepSeek V4 Flash (Free)"; description = "Fast, free tier" },
    @{ slug = "deepseek-v4-flash"; display_name = "DeepSeek V4 Flash"; description = "Fast general purpose" },
    @{ slug = "minimax-m3-free"; display_name = "MiniMax M3 (Free)"; description = "Free tier model" },
    @{ slug = "nemotron-3-super-free"; display_name = "Nemotron 3 Super (Free)"; description = "Free tier" },
    @{ slug = "qwen3.6-plus-free"; display_name = "Qwen 3.6 Plus (Free)"; description = "Free tier" }
  )
}
$modelCatalog | ConvertTo-Json | Set-Content -Path $catalogFile -NoNewline
Write-Ok "Model catalog written to $catalogFile"

# Build the provider block. Codex Desktop uses format:
# [model_providers.antigravity]
# name = "Antigravity Proxy"
# base_url = "http://localhost:4000/v1/"
# wire_api = "responses"
$providerName = "antigravity"
$providerBlock = @"

[model_providers.$providerName]
name = "Antigravity Proxy"
base_url = "$ProxyUrl/v1/"
wire_api = "responses"

"@

if (Test-Path $codexConfigFile) {
  $content = Get-Content -Path $codexConfigFile -Raw

  # Add or update the model provider block
  if ($content -match "\[model_providers\.$providerName\]") {
    # Remove the old block and replace
    $lines = $content -split "`r?`n"
    $newLines = @()
    $skip = $false
    $inProvider = $false
    foreach ($line in $lines) {
      if ($line -match "\[model_providers\.$providerName\]") {
        $inProvider = $true
        $skip = $true
        continue
      }
      if ($inProvider -and $line -match "^\[") {
        $inProvider = $false
        $skip = $false
      }
      if (-not $skip) {
        $newLines += $line
      }
    }
    $content = ($newLines -join "`r`n") + $providerBlock
    Write-Ok "Updated existing $providerName provider in config.toml"
  } else {
    $content += $providerBlock
    Write-Ok "Added $providerName provider to config.toml"
  }

  # Ensure model_provider is set to our provider
  if ($content -match 'model_provider\s*=') {
    $content = $content -replace 'model_provider\s*=\s*"[^"]*"', "model_provider = `"$providerName`""
  } else {
    $content = "model_provider = `"$providerName`"`r`n" + $content
  }

  # Ensure model is configured
  if ($content -notmatch '(?m)^model\s*=') {
    $content = "model = `"deepseek-v4-flash-free`"`r`n" + $content
  }

  Set-Content -Path $codexConfigFile -Value $content -NoNewline
} else {
  # Create fresh config.toml
  $initialConfig = @"
model = "deepseek-v4-flash-free"
model_provider = "$providerName"
$providerBlock
"@
  Set-Content -Path $codexConfigFile -Value $initialConfig -NoNewline
  Write-Ok "Created new config.toml at $codexConfigFile"
}

# -- 5. Set environment variables for convenience ----------------------------
Write-Step "Setting environment variables"
$env:OPENAI_BASE_URL = "$ProxyUrl/v1"
Write-Ok "OPENAI_BASE_URL=$env:OPENAI_BASE_URL"

# -- 6. Launch Codex ---------------------------------------------------------
Write-Step "Launching OpenAI Codex Desktop App"
$launched = $false

# Try launching UWP/Store app protocol handler or execution alias
try {
  Start-Process "codex:" -ErrorAction Stop
  Write-Ok "Codex Desktop App launched via codex: protocol!"
  $launched = $true
} catch {
  try {
    Start-Process "codex" -ErrorAction Stop
    Write-Ok "Codex Desktop App launched via 'codex' command!"
    $launched = $true
  } catch {
    try {
      Start-Process "codex.exe" -ErrorAction Stop
      Write-Ok "Codex Desktop App launched via 'codex.exe'!"
      $launched = $true
    } catch {
      Write-Warn "Could not launch Codex automatically."
      Write-Info "Manual launch instructions:"
      Write-Info "  1. Open the OpenAI Codex Desktop App"
      Write-Info "  2. Go to Settings > Provider"
      Write-Info "  3. Select 'Antigravity Proxy'"
      Write-Info "  4. The proxy is running at $ProxyUrl/v1/"
    }
  }
}

if ($launched) {
  Write-Step "Summary"
  Write-Info "Proxy URL:     $ProxyUrl/v1/"
  Write-Info "Provider:      $providerName"
  Write-Info "Model:         $env:CODEX_MODEL"
  Write-Info "Config file:   $codexConfigFile"
  Write-Info "Catalog file:  $catalogFile"
  Write-Info "Codex Desktop should now be using Antigravity Proxy."
  Write-Info "Check the proxy dashboard at http://localhost:$ProxyPort/dashboard"
}
