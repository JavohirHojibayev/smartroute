param(
    [string]$BackendHost = "192.168.0.3",
    [int]$BackendPort = 3000,
    [string]$Username = "admin",
    [Parameter(Mandatory = $true)]
    [string]$Password,
    [int]$LookbackHours = 12,
    [int]$MaxResultsPerDevice = 50
)

$ErrorActionPreference = "Stop"

$devices = @(
    @{ Name = "Kirish-1"; Ip = "192.168.0.223"; EventType = "entrance"; DeviceId = "IN-1" },
    @{ Name = "Kirish-2"; Ip = "192.168.0.221"; EventType = "entrance"; DeviceId = "IN-2" },
    @{ Name = "Kirish-3"; Ip = "192.168.0.219"; EventType = "entrance"; DeviceId = "IN-3" },
    @{ Name = "Chiqish-1"; Ip = "192.168.0.224"; EventType = "exit"; DeviceId = "OUT-1" },
    @{ Name = "Chiqish-2"; Ip = "192.168.0.222"; EventType = "exit"; DeviceId = "OUT-2" },
    @{ Name = "Chiqish-3"; Ip = "192.168.0.220"; EventType = "exit"; DeviceId = "OUT-3" }
)

function Search-DeviceEvents {
    param(
        [string]$Ip,
        [datetime]$StartTime,
        [datetime]$EndTime,
        [int]$MaxResults
    )

    $baseCond = @{
        searchID = "smartroute-sync-$Ip"
        searchResultPosition = 0
        maxResults = 1
        major = 5
        minor = 0
        startTime = $StartTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
        endTime = $EndTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
    }

    $payload = @{
        AcsEventCond = @{
            searchID = $baseCond.searchID
            searchResultPosition = $baseCond.searchResultPosition
            maxResults = $baseCond.maxResults
            major = $baseCond.major
            minor = $baseCond.minor
            startTime = $baseCond.startTime
            endTime = $baseCond.endTime
        }
    } | ConvertTo-Json -Depth 8

    $tempJson = Join-Path $env:TEMP "smartroute-acs-search-$($Ip.Replace('.', '-')).json"
    Set-Content -Path $tempJson -Value $payload -Encoding ascii

    $tempOut = Join-Path $env:TEMP "smartroute-acs-response-$($Ip.Replace('.', '-')).json"

    & curl.exe -sS --digest -u "${Username}:${Password}" `
        -H "Content-Type: application/json" `
        -X POST `
        --data-binary "@$tempJson" `
        --output $tempOut `
        "http://${Ip}/ISAPI/AccessControl/AcsEvent?format=json" | Out-Null

    $response = Get-Content -Path $tempOut -Raw -Encoding utf8

    if ([string]::IsNullOrWhiteSpace($response)) {
        return @()
    }

    $parsed = $response | ConvertFrom-Json
    $totalMatches = [int]($parsed.AcsEvent.totalMatches)
    if ($totalMatches -le 0) {
        return @()
    }

    $startPosition = [Math]::Max(0, $totalMatches - $MaxResults)

    $payloadLatest = @{
        AcsEventCond = @{
            searchID = $baseCond.searchID
            searchResultPosition = $startPosition
            maxResults = $MaxResults
            major = $baseCond.major
            minor = $baseCond.minor
            startTime = $baseCond.startTime
            endTime = $baseCond.endTime
        }
    } | ConvertTo-Json -Depth 8

    Set-Content -Path $tempJson -Value $payloadLatest -Encoding ascii

    & curl.exe -sS --digest -u "${Username}:${Password}" `
        -H "Content-Type: application/json" `
        -X POST `
        --data-binary "@$tempJson" `
        --output $tempOut `
        "http://${Ip}/ISAPI/AccessControl/AcsEvent?format=json" | Out-Null

    $responseLatest = Get-Content -Path $tempOut -Raw -Encoding utf8
    if ([string]::IsNullOrWhiteSpace($responseLatest)) {
        return @()
    }

    $parsedLatest = $responseLatest | ConvertFrom-Json
    if (-not $parsedLatest.AcsEvent.InfoList) {
        return @()
    }

    return @($parsedLatest.AcsEvent.InfoList)
}

function Push-WebhookEvent {
    param(
        [string]$BaseUrl,
        [hashtable]$EventPayload
    )

    $json = $EventPayload | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Method Post -Uri $BaseUrl -ContentType "application/json; charset=utf-8" -Headers @{ "x-smartroute-sync" = "1" } -Body $bytes
}

$start = (Get-Date).AddHours(-1 * [Math]::Abs($LookbackHours))
$end = Get-Date
$summary = @()

foreach ($device in $devices) {
    $ip = $device.Ip
    $deviceName = $device.Name
    $eventType = $device.EventType
    $deviceId = $device.DeviceId
    $posted = 0
    $duplicates = 0
    $skipped = 0

    try {
        $events = Search-DeviceEvents -Ip $ip -StartTime $start -EndTime $end -MaxResults $MaxResultsPerDevice
        foreach ($event in $events) {
            if (-not $event) { continue }

            $minor = 0
            if ($event.PSObject.Properties.Name -contains 'minor') {
                $minor = [int]$event.minor
            }

            # Only allow successful pass events to avoid invalid/noise alarms.
            if ($minor -ne 75) {
                $skipped++
                continue
            }

            $payload = @{
                eventType = "AccessControllerEvent"
                employeeNo = $event.employeeNoString
                employeeName = $event.name
                personName = $event.name
                dateTime = $event.time
                serialNo = $event.serialNo
                cardNo = $event.cardNo
                doorNo = $event.doorNo
            }

            $url = "http://${BackendHost}:${BackendPort}/integrations/hikvision/webhook?eventType=${eventType}&deviceId=${deviceId}&deviceName=$([System.Uri]::EscapeDataString($deviceName))"
            $resp = Push-WebhookEvent -BaseUrl $url -EventPayload $payload

            if ($resp.duplicate -eq $true) {
                $duplicates++
            } elseif ($resp.ok -eq $true) {
                $posted++
            }
        }

        $summary += [pscustomobject]@{
            Device = $deviceName
            Ip = $ip
            Posted = $posted
            Duplicates = $duplicates
            Skipped = $skipped
            Status = "OK"
        }
    }
    catch {
        $summary += [pscustomobject]@{
            Device = $deviceName
            Ip = $ip
            Posted = $posted
            Duplicates = $duplicates
            Skipped = $skipped
            Status = "ERROR"
        }
    }
}

$summary | Format-Table -AutoSize
