param(
  [switch]$WithVolumes
)

$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host "Stopping HyperDesk..." -ForegroundColor Cyan

$args = @("compose", "down")
if ($WithVolumes) {
  $args += "-v"
}

& docker @args

if ($LASTEXITCODE -ne 0) {
  throw "docker compose down failed"
}

Write-Host "HyperDesk stopped." -ForegroundColor Green

