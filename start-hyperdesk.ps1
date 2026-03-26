param(
  [switch]$NoBuild,
  [switch]$NoSeed
)

$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host "== HyperDesk bootstrap ==" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example" -ForegroundColor Yellow
}

function Ensure-EnvHasLatestKeys {
  param(
    [string]$EnvFile,
    [string]$ExampleFile
  )

  if (-not (Test-Path $EnvFile) -or -not (Test-Path $ExampleFile)) {
    return
  }

  $existingKeys = @{}
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)=") {
      $existingKeys[$Matches[1]] = $true
    }
  }

  $missingLines = @()
  foreach ($line in Get-Content $ExampleFile) {
    if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)=") {
      $key = $Matches[1]
      if (-not $existingKeys.ContainsKey($key)) {
        $missingLines += $line
      }
    }
  }

  if ($missingLines.Count -gt 0) {
    Add-Content -Path $EnvFile -Value ""
    Add-Content -Path $EnvFile -Value "# Added automatically to keep compatibility with .env.example"
    foreach ($entry in $missingLines) {
      Add-Content -Path $EnvFile -Value $entry
    }
    Write-Host "Updated .env with $($missingLines.Count) missing keys from .env.example" -ForegroundColor Yellow
  }
}

Ensure-EnvHasLatestKeys -EnvFile ".env" -ExampleFile ".env.example"

function Get-EnvValue {
  param(
    [string]$EnvFile,
    [string]$Key
  )

  if (-not (Test-Path $EnvFile)) {
    return $null
  }

  foreach ($line in Get-Content $EnvFile) {
    if ($line -match "^\s*$Key=(.*)$") {
      return $Matches[1].Trim()
    }
  }

  return $null
}

function Ensure-LibvirtLocalSshAccess {
  param(
    [string]$EnvFile
  )

  $provider = Get-EnvValue -EnvFile $EnvFile -Key "HYPERVISOR_PROVIDER"
  if ($provider -ne "libvirt") {
    return
  }

  $defaultUri = Get-EnvValue -EnvFile $EnvFile -Key "LIBVIRT_DEFAULT_URI"
  if ([string]::IsNullOrWhiteSpace($defaultUri)) {
    return
  }

  $uriPattern = '^qemu\+ssh://([^@/]+)@host\.docker\.internal/(system|session)$'
  if ($defaultUri -notmatch $uriPattern) {
    return
  }

  $remoteUser = $Matches[1]
  if ([string]::IsNullOrWhiteSpace($remoteUser)) {
    return
  }

  $apiRunning = docker inspect -f "{{.State.Running}}" hyperdesk-api 2>$null
  if ($apiRunning -ne "true") {
    Write-Host "Skipping SSH bootstrap: API container is not running yet." -ForegroundColor Yellow
    return
  }

  $distros = @()
  try {
    $distros = wsl -l -q 2>$null | ForEach-Object { ($_ -replace '[^\x20-\x7E]', '').Trim() } | Where-Object { $_ }
  } catch {
    Write-Host "Skipping SSH bootstrap: WSL not available on this machine." -ForegroundColor Yellow
    return
  }

  if ($distros -notcontains "Ubuntu") {
    Write-Host "Skipping SSH bootstrap: Ubuntu WSL distro not found." -ForegroundColor Yellow
    return
  }

  Write-Host "Configuring SSH trust for libvirt URI ($defaultUri)..." -ForegroundColor Cyan

  $publicKey = docker exec hyperdesk-api sh -lc "mkdir -p /root/.ssh && chmod 700 /root/.ssh && [ -f /root/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N '' -f /root/.ssh/id_ed25519 >/dev/null; cat /root/.ssh/id_ed25519.pub" 2>$null
  $publicKey = $publicKey.Trim()
  if ([string]::IsNullOrWhiteSpace($publicKey)) {
    Write-Host "Skipping SSH bootstrap: could not generate/read container public key." -ForegroundColor Yellow
    return
  }

  $escapedPublicKey = $publicKey.Replace("'", "'\''")
  $authorizeCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF '$escapedPublicKey' ~/.ssh/authorized_keys 2>/dev/null || echo '$escapedPublicKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

  try {
    wsl --distribution Ubuntu --user $remoteUser --cd ~ -- bash -lc $authorizeCmd | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "SSH key installed for $remoteUser@host.docker.internal" -ForegroundColor Green
    } else {
      Write-Host "SSH bootstrap finished with warnings. Verify ~/.ssh/authorized_keys in Ubuntu." -ForegroundColor Yellow
    }
  } catch {
    Write-Host "SSH bootstrap failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

try {
  docker info | Out-Null
} catch {
  throw "Docker daemon is not available. Start Docker Desktop and try again."
}

Write-Host "Starting containers..." -ForegroundColor Cyan
$composeArgs = @("compose", "up", "-d")
if (-not $NoBuild) {
  $composeArgs += "--build"
}

$provider = Get-EnvValue -EnvFile ".env" -Key "HYPERVISOR_PROVIDER"
if ($provider -eq "mock") {
  $composeArgs += @("--profile", "mock")
}

& docker @composeArgs
if ($LASTEXITCODE -ne 0) {
  throw "docker compose up failed"
}

Ensure-LibvirtLocalSshAccess -EnvFile ".env"

Write-Host "Waiting for PostgreSQL health..." -ForegroundColor Cyan
$maxAttempts = 45
$healthy = $false
for ($i = 1; $i -le $maxAttempts; $i++) {
  $status = docker inspect -f "{{.State.Health.Status}}" hyperdesk-db 2>$null
  if ($status -eq "healthy") {
    $healthy = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $healthy) {
  throw "Database did not become healthy in time."
}

Write-Host "Applying migrations..." -ForegroundColor Cyan
docker compose run --rm api npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
  throw "Prisma migrate deploy failed"
}

if (-not $NoSeed) {
  Write-Host "Running seed..." -ForegroundColor Cyan
  docker compose run --rm api npm run prisma:seed
  if ($LASTEXITCODE -ne 0) {
    throw "Prisma seed failed"
  }
}

Write-Host ""
Write-Host "HyperDesk is up:" -ForegroundColor Green
Write-Host "  Web:    http://localhost:3000"
Write-Host "  API:    http://localhost:4000"
Write-Host "  Health: http://localhost:4000/health"
Write-Host ""
Write-Host "Default admin (change it after first login):" -ForegroundColor Yellow
Write-Host "  admin@hyperdesk.local / ChangeMe123!"
