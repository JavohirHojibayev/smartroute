<#
.SYNOPSIS
  SmartRoute dev serverlarni to'xtatadi (3000 — backend, 5173/5174 — Vite frontend).

.DESCRIPTION
  Ushbu portlarda LISTEN qilayotgan jarayonlarni Force bilan yopadi.
  Administrator huquqi talab qilinmaydi (o'z foydalanuvchi jarayonlari uchun).
#>
$ErrorActionPreference = 'SilentlyContinue'
$ports = @(3000, 5173, 5174)

foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $procId = $c.OwningProcess
        if ($procId -and $procId -gt 0) {
            try {
                Stop-Process -Id $procId -Force -ErrorAction Stop
                Write-Host "Port $port : PID $procId to'xtatildi."
            }
            catch {
                Write-Warning "Port $port : PID $procId ni to'xtatib bo'lmadi: $_"
            }
        }
    }
}

Write-Host "`nTekshiruv:"
foreach ($port in $ports) {
    $still = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($still) { Write-Host "  Port $port : hali band" } else { Write-Host "  Port $port : bo'sh" }
}
