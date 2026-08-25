#!/usr/bin/env pwsh
# ============================================================================
# run-tunnel.ps1 - start the JP_Lyrics stem generator on THIS PC and expose it
# to github.io through a free Cloudflare quick tunnel.
#
#   .\run-tunnel.ps1               # start service + tunnel, then ask to update the site
#   .\run-tunnel.ps1 -AutoUpdate   # same, but push the new URL to github.io without asking
#   .\run-tunnel.ps1 -SkipSiteUpdate
#   .\run-tunnel.ps1 -StopOnly     # stop a previously started service + tunnel
#
# It prints the public https://<random>.trycloudflare.com URL. Visitors of
# https://luszechai.github.io/JP_Lyrics/ can then generate off-vocal while
# this PC stays on and the tunnel is up. The URL changes on EVERY run, so
# re-run this script after a restart - it updates public/stems-config.json and
# pushes it, and the site picks the new URL up at runtime (no rebuild).
#
# Stop any time with:  .\stop-tunnel.ps1
# ============================================================================
param(
  [switch]$StopOnly,
  [switch]$SkipSiteUpdate,
  [switch]$AutoUpdate
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ServiceDir = $PSScriptRoot
$RepoRoot   = Split-Path -Parent $ServiceDir
$Port       = if ($env:STEMS_PORT) { [int]$env:STEMS_PORT } else { 8000 }

function Write-Step([string]$msg)    { Write-Host ("[stems] " + $msg) -ForegroundColor Cyan }
function Write-Ok([string]$msg)      { Write-Host ("[stems] " + $msg) -ForegroundColor Green }
function Write-WarnMsg([string]$msg) { Write-Host ("[stems] " + $msg) -ForegroundColor Yellow }
function Write-Fail([string]$msg)    { Write-Host ("[stems] " + $msg) -ForegroundColor Red }

$pidFiles = @(
  (Join-Path $ServiceDir '.service.pid'),
  (Join-Path $ServiceDir '.tunnel.pid')
)

# Start-Process joins -ArgumentList with spaces and does NOT quote elements,
# so any argument containing a space must be quoted manually.
function Quote-Arg([string]$arg) {
  if ($arg -match '[\s"]') { return '"' + ($arg -replace '"', '\"') + '"' }
  return $arg
}

function Stop-RunningProcesses {
  foreach ($f in $pidFiles) {
    if (-not (Test-Path $f)) { continue }
    $idText = (Get-Content $f -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($idText) { $idText = $idText.Trim() }
    if ($idText -match '^\d+$') {
      Stop-Process -Id ([int]$idText) -Force -ErrorAction SilentlyContinue
      Write-Step "Stopped process $idText (from $(Split-Path -Leaf $f))"
    }
    Remove-Item $f -Force -ErrorAction SilentlyContinue
  }
}

if ($StopOnly) {
  Stop-RunningProcesses
  Write-Ok 'Stopped. Bye!'
  exit 0
}

# Re-running while an old instance is up? Tear it down first so the port is free.
Stop-RunningProcesses

# --- 1. Python (prefer the existing project venv) ---------------------------
$candidates = @(
  (Join-Path $RepoRoot '.venv-stems\Scripts\python.exe'),
  (Join-Path $ServiceDir '.venv\Scripts\python.exe')
)
$python = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $python) {
  $sysPython = Get-Command python -ErrorAction SilentlyContinue
  if ($sysPython) {
    $python = $sysPython.Source
  } else {
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) { $python = $launcher.Source }
    else {
      Write-Fail 'No Python found. Install Python 3.11+ and re-run.'
      exit 1
    }
  }
}

# Add the venv's Scripts dir to PATH so the service can find yt-dlp via shutil.which.
$venvScripts = Split-Path -Parent $python
$venvScriptsLeaf = Split-Path -Leaf $venvScripts
if ($venvScriptsLeaf -eq 'Scripts') {
  $env:PATH = "$venvScripts;$env:PATH"
}

# Verify the interpreter has the service dependencies.
$depsOk = & $python -c "import importlib.util; print(all(importlib.util.find_spec(m) is not None for m in ('fastapi','demucs','numpy')))" 2>$null
if ($depsOk -notmatch 'True') {
  Write-Step 'No project venv with demucs found - creating one (first run downloads ~2 GB for torch/demucs).'
  $sysPython = Get-Command python -ErrorAction SilentlyContinue
  if (-not $sysPython) {
    Write-Fail 'Need Python on PATH to create the venv.'
    exit 1
  }
  $venvDir = Join-Path $RepoRoot '.venv-stems'
  if (-not (Test-Path (Join-Path $venvDir 'Scripts\python.exe'))) {
    & $sysPython.Source -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { Write-Fail 'Could not create the venv.'; exit 1 }
  }
  $python = Join-Path $venvDir 'Scripts\python.exe'
  & $python -m pip install --upgrade pip
  & $python -m pip install -r (Join-Path $ServiceDir 'requirements.txt')
  if ($LASTEXITCODE -ne 0) { Write-Fail 'pip install failed - see the error above.'; exit 1 }
  $env:PATH = "$(Join-Path $venvDir 'Scripts');$env:PATH"
}

# --- 2. ffmpeg -------------------------------------------------------------
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Fail 'ffmpeg not found. Install it with:  winget install Gyan.FFmpeg  (then reopen the terminal).'
  exit 1
}

# --- 3. cloudflared ----------------------------------------------------------
$cloudflared = $null
$clfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($clfCmd) {
  $cloudflared = $clfCmd.Source
} else {
  $localClf = Join-Path $ServiceDir '.cloudflared\cloudflared.exe'
  if (-not (Test-Path $localClf)) {
    Write-Step 'Downloading cloudflared (Windows)...'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $localClf) | Out-Null
    $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
      & $curl.Source -fsSL $url -o $localClf
    } else {
      Invoke-WebRequest -Uri $url -OutFile $localClf
    }
    if (-not (Test-Path $localClf)) { Write-Fail 'cloudflared download failed.'; exit 1 }
  }
  $cloudflared = $localClf
}

# --- 4. Start the stem service ------------------------------------------------
$serviceLog = Join-Path $ServiceDir '.stems-service.log'
$serviceErr = Join-Path $ServiceDir '.stems-service.err.log'
if (-not $env:STEMS_CACHE_DIR) { $env:STEMS_CACHE_DIR = Join-Path $ServiceDir 'stems_cache' }
if (-not $env:STEMS_CORS_ORIGINS) { $env:STEMS_CORS_ORIGINS = 'https://luszechai.github.io,http://localhost:8080' }
if (-not $env:STEMS_DEVICE) { $env:STEMS_DEVICE = 'cpu' }

Write-Step "Starting stem service ($python) on port $Port..."
$svc = Start-Process -FilePath $python `
  -ArgumentList @('-u', (Quote-Arg (Join-Path $ServiceDir 'app.py'))) `
  -WorkingDirectory $ServiceDir `
  -RedirectStandardOutput $serviceLog `
  -RedirectStandardError $serviceErr `
  -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $ServiceDir '.service.pid') -Value $svc.Id

$healthy = $false
for ($i = 0; $i -lt 90; $i++) {
  if ($svc.HasExited) { break }
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    if ($h.ok) { $healthy = $true; break }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $healthy) {
  Write-Fail 'Stem service did not become healthy. Last log lines:'
  Get-Content $serviceErr -Tail 15 -ErrorAction SilentlyContinue
  Write-Fail "Full log: $serviceErr"
  Stop-Process -Id $svc.Id -Force -ErrorAction SilentlyContinue
  exit 1
}
Write-Ok "Stem service healthy on http://localhost:$Port"

# --- 5. Start the Cloudflare quick tunnel --------------------------------------
$tunnelLog = Join-Path $ServiceDir '.cloudflared.log'
$tunnelErr = Join-Path $ServiceDir '.cloudflared.err.log'
Write-Step "Opening Cloudflare quick tunnel to http://localhost:$Port..."
$tun = Start-Process -FilePath $cloudflared `
  -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://localhost:$Port") `
  -WorkingDirectory $ServiceDir `
  -RedirectStandardOutput $tunnelLog `
  -RedirectStandardError $tunnelErr `
  -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $ServiceDir '.tunnel.pid') -Value $tun.Id

$url = $null
$urlRe = 'https://[a-z0-9-]+\.trycloudflare\.com'
for ($i = 0; $i -lt 90; $i++) {
  if ($tun.HasExited) { break }
  $content = ''
  try {
    if (Test-Path $tunnelLog) { $content = Get-Content $tunnelLog -Raw -ErrorAction Stop }
    if (-not $content -and (Test-Path $tunnelErr)) { $content = Get-Content $tunnelErr -Raw -ErrorAction Stop }
  } catch { }
  $m = [regex]::Match($content, $urlRe)
  if ($m.Success) { $url = $m.Value; break }
  Start-Sleep -Seconds 1
}
if (-not $url) {
  Write-Fail 'No tunnel URL appeared. Last tunnel log lines:'
  Get-Content $tunnelLog -Tail 15 -ErrorAction SilentlyContinue
  Get-Content $tunnelErr -Tail 15 -ErrorAction SilentlyContinue
  Stop-Process -Id $tun.Id -Force -ErrorAction SilentlyContinue
  exit 1
}

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Green
Write-Host "  PUBLIC URL:  $url" -ForegroundColor Green
Write-Host '  Anyone on https://luszechai.github.io/JP_Lyrics/ can now use' -ForegroundColor Green
Write-Host '  the automated off-vocal karaoke while this PC stays on.' -ForegroundColor Green
Write-Host '  (First request per song takes ~1-2 min to generate, then cached.)' -ForegroundColor Green
Write-Host '==============================================================' -ForegroundColor Green
Write-Host ''

# --- 6. Point the deployed site at this URL (runtime config, no rebuild) ------
$configPath = Join-Path $RepoRoot 'public\stems-config.json'
$doUpdate = $false
if ($SkipSiteUpdate) {
  Write-WarnMsg 'Skipping github.io config update (-SkipSiteUpdate).'
} elseif ($AutoUpdate) {
  $doUpdate = $true
} elseif ([Environment]::UserInteractive) {
  $answer = Read-Host 'Update github.io now so the site points at this URL? [Y/n]'
  $doUpdate = ($answer -eq '' -or $answer -match '^(y|yes)$')
}

if ($doUpdate) {
  try {
    $json = Get-Content $configPath -Raw | ConvertFrom-Json
    if ($json.apiUrl -eq $url) {
      Write-Ok 'stems-config.json already points at this URL - nothing to push.'
    } else {
      $json.apiUrl = $url
      $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::WriteAllText($configPath, ($json | ConvertTo-Json), $utf8NoBom)
      git -C $RepoRoot add public/stems-config.json
      git -C $RepoRoot commit -m 'stems: point site at live tunnel URL'
      git -C $RepoRoot push origin main
      if ($LASTEXITCODE -eq 0) {
        Write-Ok 'Pushed. GitHub Pages will pick up the new URL in ~1-2 min.'
      } else {
        Write-Fail 'git push failed - the commit is ready locally. Push it yourself:'
        Write-Fail "  git -C `"$RepoRoot`" push origin main"
      }
    }
  } catch {
    Write-Fail "Could not auto-update the config: $($_.Exception.Message)"
    Write-Fail "Edit $configPath and set `"apiUrl`": `"$url`" manually, commit, and push."
  }
} else {
  Write-WarnMsg 'Site not updated. To enable it, set apiUrl in the file below to:'
  Write-WarnMsg "  $configPath"
  Write-WarnMsg "  $url"
}

Write-Host ''
Write-Step 'Everything is running in the background.'
Write-Step "  stem service log : $serviceLog"
Write-Step "  tunnel log       : $tunnelLog"
Write-Host ''
Write-Ok 'Stop any time with:  .\stop-tunnel.ps1  (in this folder)'
Write-Host ''
