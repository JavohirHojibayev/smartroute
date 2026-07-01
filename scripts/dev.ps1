<#
.SYNOPSIS
  Backend (Nest) va frontend (Vite) serverlarini ishga tushiradi yoki to'xtatadi.
#>
param (
    [ValidateSet("Start", "Stop")]
    [string]$Action = "Start"
)

if ($Action -eq "Stop") {
    $ErrorActionPreference = 'SilentlyContinue'
    $ports = 3000, 5173, 5174
    foreach ($port in $ports) {
        Get-NetTCPConnection -LocalPort $port -State Listen | ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force
            Write-Host "Port $port : PID $($_.OwningProcess) to'xtatildi."
        }
    }
    Write-Host "`nTekshiruv:"
    foreach ($port in $ports) {
        $status = if (Get-NetTCPConnection -LocalPort $port -State Listen) { "band" } else { "bo'sh" }
        Write-Host "  Port $port : $status"
    }
    return
}

if ($Action -eq "Start") {
    $ErrorActionPreference = 'Stop'
    $RepoRoot = Split-Path -Parent $PSScriptRoot
    $Backend = Join-Path $RepoRoot 'backend'
    $Frontend = Join-Path $RepoRoot 'frontend'

    function Get-LanIpv4Address {
        $route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
        if ($route) {
            $ip = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.ifIndex -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' } | Select-Object -ExpandProperty IPAddress -First 1
            if ($ip) { return $ip }
        }
        return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet' } | Select-Object -ExpandProperty IPAddress -First 1
    }

    if (-not (Test-Path "$Backend\package.json")) { throw "Backend topilmadi: $Backend" }
    if (-not (Test-Path "$Frontend\package.json")) { throw "Frontend topilmadi: $Frontend" }

    $psExe = if (Test-Path "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe") { "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" } else { 'powershell.exe' }

    Write-Host "Backend oynasi ochilmoqda: npm run start:dev"
    Start-Process $psExe -WorkingDirectory $Backend -ArgumentList '-NoExit', '-NoProfile', '-Command', 'npm run start:dev' | Out-Null

    Start-Sleep -Milliseconds 800

    Write-Host "Frontend oynasi ochilmoqda: npm run dev"
    Start-Process $psExe -WorkingDirectory $Frontend -ArgumentList '-NoExit', '-NoProfile', '-Command', 'npm run dev' | Out-Null

    $lanIp = Get-LanIpv4Address

    Write-Host "`nTayyor.`n  Frontend: http://localhost:5173`n  Backend : http://localhost:3000"
    if ($lanIp) {
        Write-Host "  Frontend (LAN): http://$lanIp`:5173`n  Backend  (LAN): http://$lanIp`:3000"
    }
    Write-Host "`nIkkala oynada ham Ctrl+C bilan to'xtating yoki .\scripts\dev.ps1 -Action Stop ishga tushiring."
}
