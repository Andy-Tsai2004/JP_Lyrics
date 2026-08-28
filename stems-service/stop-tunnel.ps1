#!/usr/bin/env pwsh
# stop-tunnel.ps1 - stop the stem service + Cloudflare tunnel started by run-tunnel.ps1.
$ErrorActionPreference = 'Stop'
$ServiceDir = $PSScriptRoot

foreach ($f in @(
    (Join-Path $ServiceDir '.service.pid'),
    (Join-Path $ServiceDir '.tunnel.pid')
  )) {
  if (-not (Test-Path $f)) { continue }
  $idText = (Get-Content $f | Select-Object -First 1)
  if ($idText) { $idText = $idText.Trim() }
  if ($idText -match '^\d+$') {
    Stop-Process -Id ([int]$idText) -Force -ErrorAction SilentlyContinue
    Write-Host "[stems] stopped pid $idText"
  }
  Remove-Item $f -Force -ErrorAction SilentlyContinue
}
Write-Host '[stems] done.'
