#!/usr/bin/env pwsh
# ============================================================================
# run-tunnel-wsl.ps1 - start the JP_Lyrics stem generator INSIDE WSL2 and, by
# default, open a free Cloudflare quick tunnel so github.io visitors can use
# the automated off-vocal karaoke while this PC stays on.
#
#   .\run-tunnel-wsl.ps1                  # service + tunnel in WSL, then ask to push
#   .\run-tunnel-wsl.ps1 -AutoUpdate      # same, but push without asking
#   .\run-tunnel-wsl.ps1 -LocalOnly       # service only (localhost:8000), no tunnel
#   .\run-tunnel-wsl.ps1 -SkipSiteUpdate  # don't touch public/stems-config.json
#   .\run-tunnel-wsl.ps1 -StopOnly        # stop the WSL service + tunnel
#
# The venv + stems cache live inside WSL ($HOME/.jplyrics-stems). The tunnel
# URL changes on every run; this script reads it back from the repo and pushes
# the new URL to github.io using the Windows git credentials.
# ============================================================================
param(
  [switch]$StopOnly,
  [switch]$LocalOnly,
  [switch]$SkipSiteUpdate,
  [switch]$AutoUpdate,
  [string]$Distro = ''
)

$ErrorActionPreference = 'Stop'
$ServiceDir = $PSScriptRoot
$RepoRoot   = Split-Path -Parent $ServiceDir

function Write-Step([string]$msg)    { Write-Host ("[stems] " + $msg) -ForegroundColor Cyan }
function Write-Ok([string]$msg)      { Write-Host ("[stems] " + $msg) -ForegroundColor Green }
function Write-WarnMsg([string]$msg) { Write-Host ("[stems] " + $msg) -ForegroundColor Yellow }
function Write-Fail([string]$msg)    { Write-Host ("[stems] " + $msg) -ForegroundColor Red }

# --- find a WSL distro --------------------------------------------------------
# `wsl -l -q` emits UTF-16, which PowerShell 5.1 mangles; instead of parsing
# text, just probe candidate names with `wsl -d <name> -- true`.
$distro = $Distro
if (-not $distro) {
  foreach ($candidate in @('Ubuntu-24.04', 'Ubuntu-22.04', 'Ubuntu-20.04', 'Ubuntu', 'Debian')) {
    & wsl -d $candidate -- true 2>$null
    if ($LASTEXITCODE -eq 0) { $distro = $candidate; break }
  }
}
if (-not $distro) {
  Write-Fail 'No WSL distro found. Install one with:  wsl --install -d Ubuntu-24.04'
  exit 1
}
Write-Step "Using WSL distro: $distro"

# Windows path -> WSL path (/mnt/c/...; WSL mounts drives in lowercase).
$driveLetter = $ServiceDir.Substring(0, 1).ToLower()
$wslScriptDir = '/mnt/' + $driveLetter + $ServiceDir.Substring(2).Replace('\', '/')
$wslRunScript  = "$wslScriptDir/run-tunnel.sh"
$wslStopScript = "$wslScriptDir/stop-tunnel.sh"

if ($StopOnly) {
  Write-Step 'Stopping WSL service + tunnel...'
  & wsl -d $distro -- bash $wslStopScript
  exit $LASTEXITCODE
}

$flags = @()
if ($LocalOnly) { $flags += '--local' }
if ($SkipSiteUpdate) { $flags += '--no-config' }

Write-Step "Starting host in WSL ($distro)... (first run installs ffmpeg + demucs, ~2 GB)"
& wsl -d $distro -- bash $wslRunScript @flags
if ($LASTEXITCODE -ne 0) {
  Write-Fail 'WSL host script failed - see the output above.'
  exit $LASTEXITCODE
}

if ($LocalOnly) {
  Write-Host ''
  Write-Ok 'Stem service is running locally at http://localhost:8000 (API only - no page at /).'
  Write-Ok 'Health check:  http://localhost:8000/api/health'
  Write-Ok 'Stop any time with:  .\run-tunnel-wsl.ps1 -StopOnly'
  Write-Host ''
  exit 0
}

$urlFile = Join-Path $ServiceDir '.tunnel-url'
if (-not (Test-Path $urlFile)) {
  Write-Fail 'Tunnel URL file not found - check the WSL output above.'
  exit 1
}
$url = (Get-Content $urlFile | Select-Object -First 1).Trim()

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Green
Write-Host "  PUBLIC URL:  $url" -ForegroundColor Green
Write-Host '  Anyone on https://luszechai.github.io/JP_Lyrics/ can now use' -ForegroundColor Green
Write-Host '  the automated off-vocal karaoke while this PC stays on.' -ForegroundColor Green
Write-Host '  (First request per song takes ~1-2 min to generate, then cached.)' -ForegroundColor Green
Write-Host '==============================================================' -ForegroundColor Green
Write-Host ''

# --- push the runtime config with Windows git credentials -----------------------
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
    git -C $RepoRoot add public/stems-config.json
    git -C $RepoRoot diff --cached --quiet -- public/stems-config.json
    if ($LASTEXITCODE -eq 0) {
      Write-Ok 'stems-config.json already points at this URL - nothing to push.'
    } else {
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
Write-Ok 'Stop any time with:  .\run-tunnel-wsl.ps1 -StopOnly'
Write-Host ''
