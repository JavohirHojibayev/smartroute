<#
.SYNOPSIS
  Turniketlar (Hikvision) bilan ma'lumotlarni sinxronlash va sozlash uchun yagona skript.
#>
param(
    [ValidateSet("ConfigureHttpHosts", "SyncEvents", "SyncUsers", "SyncAll")]
    [string]$Action = "SyncAll",
    [string]$BackendHost = "localhost",
    [int]$BackendPort = 3000,
    [string]$Username,
    [Parameter(Mandatory = $true)][string]$AuthSecret,
    [int]$LookbackHours = 12,
    [int]$MaxResultsPerDevice = 50,
    [int]$PageSize = 100,
    [int]$MaxPages = 100
)

$ErrorActionPreference = "Stop"
$devices = @()

# --- Yordamchi Funksiyalar ---
function Invoke-HikApi($Ip, $Path, $Method="GET", $BodyFile=$null, $OutputFile=$null) {
    $curlArgs = @("-sS", "--digest", "-u", "${Username}:${AuthSecret}", "-X", $Method)
    if ($BodyFile -and ($Method -eq "PUT" -or $Method -eq "POST")) {
        $contentType = if ($Path -match "AcsEvent|UserInfo|CardInfo") { "application/json" } else { "application/xml" }
        $curlArgs += "-H", "Content-Type: $contentType", "--data-binary", "@$BodyFile"
    }
    if ($OutputFile) {
        $curlArgs += "--output", $OutputFile
    }
    $curlArgs += "http://${Ip}${Path}"
    return & curl.exe $curlArgs
}

function Push-WebhookEvent($BaseUrl, $EventPayload) {
    $json = $EventPayload | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Method Post -Uri $BaseUrl -ContentType "application/json; charset=utf-8" -Headers @{ "x-smartroute-sync" = "1" } -Body $bytes
}

# --- Amalga oshirish funksiyalari ---

function Set-HttpHosts {
    $backupDir = Join-Path $PSScriptRoot "turnstile-backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    $null = New-Item -ItemType Directory -Path $backupDir -Force
    $results = foreach ($device in $devices) {
        try {
            $ip = $device.Ip
            "httpHosts", "httpHosts/1", "httpHosts/2" | ForEach-Object {
                $res = Invoke-HikApi $ip "/ISAPI/Event/notification/$_"
                Set-Content -Path "$backupDir\${ip}-before-$(($_ -replace '/','-')).xml" -Value $res -Encoding ascii
            }

            $xmlUrl = "/integrations/hikvision/webhook?eventType=$([uri]::EscapeDataString($device.EventType))&deviceId=$([uri]::EscapeDataString($device.DeviceId))&deviceName=$([uri]::EscapeDataString($device.Name))"
            $xmlBody = @"
<?xml version="1.0" encoding="UTF-8"?>
<HttpHostNotification version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<id>2</id><url>$($xmlUrl.Replace('&', '&amp;'))</url><protocolType>HTTP</protocolType><parameterFormatType></parameterFormatType><addressingFormatType>ipaddress</addressingFormatType><ipAddress>$BackendHost</ipAddress><portNo>$BackendPort</portNo><httpAuthenticationMethod></httpAuthenticationMethod>
</HttpHostNotification>
"@
            $tempXml = "$backupDir\${ip}-slot2-put.xml"
            Set-Content -Path $tempXml -Value $xmlBody -Encoding ascii
            $putRes = Invoke-HikApi $ip "/ISAPI/Event/notification/httpHosts/2" "PUT" $tempXml
            Set-Content -Path "$backupDir\${ip}-slot2-after.xml" -Value (Invoke-HikApi $ip "/ISAPI/Event/notification/httpHosts/2") -Encoding ascii

            [pscustomobject]@{ Ip = $ip; Name = $device.Name; Slot2Updated = [bool]($putRes -match "<statusString>OK</statusString>") }
        } catch {
            [pscustomobject]@{ Ip = $device.Ip; Name = $device.Name; Slot2Updated = $false }
        }
    }
    $results | Format-Table -AutoSize
    Write-Output "`nBackup folder: $backupDir"
}

function Sync-Events {
    function Search-DeviceEvents($Ip, $StartTime, $EndTime, $MaxResults) {
        $baseCond = @{
            searchID = "smartroute-sync-$Ip"; major = 5; minor = 0
            startTime = $StartTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
            endTime = $EndTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
        }
        $fetch = {
            param($pos, $max)
            $cond = $baseCond.Clone()
            $cond.searchResultPosition = $pos; $cond.maxResults = $max
            $tmpJson = "$env:TEMP\sr-ev-req-$Ip.json"
            $tmpOut = "$env:TEMP\sr-ev-res-$Ip.json"
            @{AcsEventCond = $cond} | ConvertTo-Json -Depth 8 | Set-Content $tmpJson -Encoding ascii
            Invoke-HikApi $Ip "/ISAPI/AccessControl/AcsEvent?format=json" "POST" $tmpJson $tmpOut | Out-Null
            $res = Get-Content $tmpOut -Raw -Encoding utf8
            if ([string]::IsNullOrWhiteSpace($res)) { return $null }
            return $res | ConvertFrom-Json
        }

        $first = &$fetch 0 1
        if (-not $first -or $first.AcsEvent.totalMatches -le 0) { return @() }
        
        $startPos = [Math]::Max(0, $first.AcsEvent.totalMatches - $MaxResults)
        $latest = &$fetch $startPos $MaxResults
        if (-not $latest -or -not $latest.AcsEvent.InfoList) { return @() }
        return @($latest.AcsEvent.InfoList)
    }

    $start = (Get-Date).AddHours(-[Math]::Abs($LookbackHours))
    $end = Get-Date

    $summary = foreach ($device in $devices) {
        $res = [pscustomobject]@{ Device = $device.Name; Ip = $device.Ip; Posted = 0; Duplicates = 0; Skipped = 0; Status = "OK" }
        try {
            $events = Search-DeviceEvents $device.Ip $start $end $MaxResultsPerDevice
            foreach ($ev in $events) {
                if (-not $ev -or $ev.minor -ne 75) { $res.Skipped++; continue }
                
                $payload = @{
                    eventType = "AccessControllerEvent"; employeeNo = $ev.employeeNoString; employeeName = $ev.name
                    personName = $ev.name; dateTime = $ev.time; serialNo = $ev.serialNo
                    cardNo = $ev.cardNo; doorNo = $ev.doorNo
                }
                
                $url = "http://${BackendHost}:${BackendPort}/integrations/hikvision/webhook?eventType=$([uri]::EscapeDataString($device.EventType))&deviceId=$([uri]::EscapeDataString($device.DeviceId))&deviceName=$([uri]::EscapeDataString($device.Name))"
                $resp = Push-WebhookEvent $url $payload
                if ($resp.duplicate) { $res.Duplicates++ } elseif ($resp.ok) { $res.Posted++ }
            }
        } catch {
            $res.Status = "ERROR"
        }
        $res
    }
    $summary | Format-Table -AutoSize
}

function Sync-Users {
    function Clean($v) { if ([string]::IsNullOrWhiteSpace($v)) { "" } else { ("$v".Trim() -replace "'{2,}", "'") -replace '\s+', ' ' } }
    function CleanId($v) { $c = Clean $v; if ($c -match '^\d+$') { $c -replace '^0+', '' | Where-Object {$_} | Select-Object -First 1 } else { $c } }

    function Get-Dept($User) {
        if (-not $User) { return $null }
        foreach ($k in "department","departmentName","dept","deptName","org","orgName","organization","organizationName","unit","unitName","group","groupName","team","teamName") {
            if ($User.PSObject.Properties.Name -contains $k -and ($d = Clean $User.$k)) { return $d }
        }
        foreach ($p in $User.PSObject.Properties) {
            if ($p.Value -is [pscustomobject] -and ($d = Get-Dept $p.Value)) { return $d }
        }
    }

    function Score($Name) {
        if (-not ($n = Clean $Name)) { return 0 }
        $p = ($n -split ' ' | Where-Object { $_ }).Count
        $s = [Math]::Min($p, 4) * 10 + [Math]::Min($n.Length, 60)
        if ($n -match '\p{IsCyrillic}') { $s += 8 }
        if ($n -match '[A-Za-z]') { $s += 2 }
        if ($n -match 'UNKNOWN|TEST|DRIVER') { $s -= 25 }
        return $s
    }

    function Fetch($Ip, $Type) {
        $items = @(); $pos = 0; $pages = 0; $total = $null
        while ($pages -lt $MaxPages) {
            $cond = @{ searchID = "sr-$Type-$Ip"; searchResultPosition = $pos; maxResults = $PageSize }
            $payload = @{ "$Type`SearchCond" = $cond } | ConvertTo-Json -Depth 8 -Compress
            $req = "$env:TEMP\sr-$Type-req-$Ip.json"; $res = "$env:TEMP\sr-$Type-res-$Ip.json"
            Set-Content -Path $req -Value $payload -Encoding ascii
            Invoke-HikApi $Ip "/ISAPI/AccessControl/$Type/Search?format=json" "POST" $req $res | Out-Null
            $parsed = Get-Content $res -Raw -Encoding utf8 | ConvertFrom-Json
            $search = $parsed."$Type`Search"
            if (-not $search) { break }
            if ($null -eq $total) { $total = [int]$search.totalMatches }
            $page = @($search.$Type)
            if (-not $page) { break }
            $items += $page; $pos += $page.Count; $pages++
            if ($total -gt 0 -and $pos -ge $total) { break }
        }
        return $items
    }

    $best = @{}
    $summary = foreach ($device in $devices) {
        $res = [pscustomobject]@{ Device = $device.Name; Ip = $device.Ip; UsersRead = 0; CardsRead = 0; CardsMapped = 0; Status = "OK" }
        try {
            foreach ($u in Fetch $device.Ip "UserInfo") {
                $res.UsersRead++
                $id = CleanId $u.employeeNo
                $name = Clean $u.name
                if ($id -and $name) {
                    $score = Score $name; $dept = Get-Dept $u
                    if (-not $best.ContainsKey($id) -or $score -ge $best[$id].score) {
                        $best[$id] = @{ id = $id; name = $name; ip = $device.Ip; dept = $dept; score = $score }
                    } elseif (-not $best[$id].dept -and $dept) { $best[$id].dept = $dept }
                }
            }
        } catch { $res.Status = "USER_ERROR" }

        try {
            foreach ($c in Fetch $device.Ip "CardInfo") {
                $res.CardsRead++
                $cId = CleanId $c.cardNo
                $eId = CleanId $c.employeeNo
                if ($cId -and $eId -and $best.ContainsKey($eId)) {
                    $e = $best[$eId]
                    if (-not $best.ContainsKey($cId) -or $e.score -ge $best[$cId].score) {
                        $best[$cId] = @{ id = $cId; name = $e.name; ip = $device.Ip; dept = $e.dept; score = $e.score }
                        $res.CardsMapped++
                    }
                }
            }
        } catch { $res.Status = if ($res.Status -eq "OK") { "CARD_ERROR" } else { "USER_CARD_ERROR" } }
        $res
    }

    $items = @($best.Values | ForEach-Object { @{ externalId = $_.id; fullName = $_.name; sourceIp = $_.ip; department = $_.dept } })
    $backendUrl = "http://${BackendHost}:${BackendPort}/integrations/hikvision/identities/bulk"
    $total = @{ created = 0; updated = 0; appliedToLogs = 0; skipped = 0 }

    for ($i = 0; $i -lt $items.Count; $i += 200) {
        $batch = $items[$i..[Math]::Min($i + 199, $items.Count - 1)]
        $payload = @{ items = $batch; applyToLogs = $true } | ConvertTo-Json -Depth 8
        $r = Invoke-RestMethod -Method Post -Uri $backendUrl -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($payload))
        $total.created += [int]$r.created; $total.updated += [int]$r.updated; $total.appliedToLogs += [int]$r.appliedToLogs; $total.skipped += [int]$r.skipped
    }

    Write-Host "`nDevice summary:"
    $summary | Format-Table -AutoSize
    Write-Host "`nBackend sync result:"
    @{ ok = $true; total = $items.Count; created = $total.created; updated = $total.updated; appliedToLogs = $total.appliedToLogs; skipped = $total.skipped } | ConvertTo-Json -Depth 6
}

# --- Asosiy mantiq ---

switch ($Action) {
    "ConfigureHttpHosts" {
        Write-Host "Configuring HttpHosts..."
        Set-HttpHosts
    }
    "SyncEvents" {
        Write-Host "Syncing Events..."
        Sync-Events
    }
    "SyncUsers" {
        Write-Host "Syncing Users..."
        Sync-Users
    }
    "SyncAll" {
        Write-Host "Syncing Users..."
        Sync-Users
        Write-Host "`nSyncing Events..."
        Sync-Events
    }
}
