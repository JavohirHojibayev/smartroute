<#
.SYNOPSIS
  Backend (Nest) va frontend (Vite) ni alohida PowerShell oynalarida ishga tushiradi.

.DESCRIPTION
  smartroute papkasidan ishga tushiring:
    .\scripts\start-smartroute-dev.ps1

  Backend: http://localhost:3000
  Frontend: odatda http://localhost:5173 (band bo'lsa Vite boshqa port tanlaydi)
#>
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $RepoRoot 'backend'
$Frontend = Join-Path $RepoRoot 'frontend'

function Get-LanIpv4Addresses {
    $bestRoute = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
        Sort-Object RouteMetric, InterfaceMetric |
        Select-Object -First 1

    if ($bestRoute) {
        $primaryIp = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $bestRoute.ifIndex -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -notmatch '^(127|169\.254)\.'
            } |
            Sort-Object SkipAsSource, PrefixOrigin |
            Select-Object -ExpandProperty IPAddress -First 1

        if ($primaryIp) {
            return @($primaryIp)
        }
    }

    $fallback = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -and
            $_.IPAddress -notmatch '^(127|169\.254)\.' -and
            $_.InterfaceAlias -notmatch 'Loopback|vEthernet'
        } |
        Select-Object -ExpandProperty IPAddress -First 1

    if ($fallback) {
        return @($fallback)
    }

    return @()
}

if (-not (Test-Path (Join-Path $Backend 'package.json'))) {
    Write-Error "Backend topilmadi: $Backend"
}
if (-not (Test-Path (Join-Path $Frontend 'package.json'))) {
    Write-Error "Frontend topilmadi: $Frontend"
}

$psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $psExe)) {
    $psExe = 'powershell.exe'
}

Write-Host "Backend oynasi ochilmoqda: npm run start:dev"
Start-Process -FilePath $psExe -WorkingDirectory $Backend -ArgumentList @(
    '-NoExit', '-NoProfile', '-Command', 'npm run start:dev'
) | Out-Null

Start-Sleep -Milliseconds 800

Write-Host "Frontend oynasi ochilmoqda: npm run dev"
Start-Process -FilePath $psExe -WorkingDirectory $Frontend -ArgumentList @(
    '-NoExit', '-NoProfile', '-Command', 'npm run dev'
) | Out-Null

$lanIps = Get-LanIpv4Addresses

Write-Host ''
Write-Host 'Tayyor.'
Write-Host '  Frontend: http://localhost:5173'
Write-Host '  Backend : http://localhost:3000'
foreach ($ip in $lanIps) {
    Write-Host "  Frontend (LAN): http://$ip`:5173"
    Write-Host "  Backend  (LAN): http://$ip`:3000"
}
Write-Host ''
Write-Host "Ikkala oynada ham Ctrl+C bilan to'xtating yoki .\scripts\stop-smartroute-dev.ps1 ishga tushiring."
