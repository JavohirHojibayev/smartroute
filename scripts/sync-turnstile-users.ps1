param(
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 3000,
    [string]$Username = "admin",
    [Parameter(Mandatory = $true)]
    [string]$Password,
    [int]$PageSize = 100,
    [int]$MaxPages = 100
)

$ErrorActionPreference = "Stop"

$devices = @(
    @{ Name = "Kirish-1"; Ip = "192.168.0.223" },
    @{ Name = "Kirish-2"; Ip = "192.168.0.221" },
    @{ Name = "Kirish-3"; Ip = "192.168.0.219" },
    @{ Name = "Chiqish-1"; Ip = "192.168.0.224" },
    @{ Name = "Chiqish-2"; Ip = "192.168.0.222" },
    @{ Name = "Chiqish-3"; Ip = "192.168.0.220" }
)

function Normalize-ExternalId {
    param([string]$Value)
    $raw = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) { return "" }
    if ($raw -match '^\d+$') {
        $trimmed = $raw -replace '^0+', ''
        if ([string]::IsNullOrEmpty($trimmed)) { return "0" }
        return $trimmed
    }
    return $raw
}

function Normalize-Name {
    param([string]$Value)
    $name = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($name)) { return "" }
    $name = ($name -replace "'{2,}", "'") -replace '\s+', ' '
    return $name.Trim()
}

function Name-Score {
    param([string]$Value)
    $name = Normalize-Name -Value $Value
    if ([string]::IsNullOrWhiteSpace($name)) { return 0 }
    $parts = ($name -split ' ' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
    $score = [Math]::Min($parts, 4) * 10 + [Math]::Min($name.Length, 60)
    if ($name -match '\p{IsCyrillic}') { $score += 8 }
    if ($name -match '[A-Za-z]') { $score += 2 }
    if ($name -match 'UNKNOWN|TEST|DRIVER') { $score -= 25 }
    return $score
}

function Upsert-BestIdentity {
    param(
        [hashtable]$Map,
        [string]$ExternalId,
        [string]$FullName,
        [string]$SourceIp
    )

    $normalizedId = Normalize-ExternalId -Value $ExternalId
    $normalizedName = Normalize-Name -Value $FullName
    if ([string]::IsNullOrWhiteSpace($normalizedId) -or [string]::IsNullOrWhiteSpace($normalizedName)) {
        return $false
    }

    $candidateScore = Name-Score -Value $normalizedName
    if (-not $Map.ContainsKey($normalizedId)) {
        $Map[$normalizedId] = @{
            externalId = $normalizedId
            fullName = $normalizedName
            sourceIp = $SourceIp
            score = $candidateScore
        }
        return $true
    }

    $existing = $Map[$normalizedId]
    if ($candidateScore -ge [int]$existing.score) {
        $Map[$normalizedId] = @{
            externalId = $normalizedId
            fullName = $normalizedName
            sourceIp = $SourceIp
            score = $candidateScore
        }
        return $true
    }

    return $false
}

function Get-DeviceUsers {
    param(
        [string]$Ip,
        [int]$PageSize,
        [int]$MaxPages
    )

    $users = @()
    $position = 0
    $pages = 0
    $totalMatches = $null

    while ($pages -lt $MaxPages) {
        $payloadObj = @{
            UserInfoSearchCond = @{
                searchID = "smartroute-user-sync-$Ip"
                searchResultPosition = $position
                maxResults = $PageSize
            }
        }
        $payload = $payloadObj | ConvertTo-Json -Depth 8 -Compress

        $tmpReq = Join-Path $env:TEMP "smartroute-user-search-$($Ip.Replace('.', '-')).json"
        $tmpRes = Join-Path $env:TEMP "smartroute-user-search-res-$($Ip.Replace('.', '-')).json"
        Set-Content -Path $tmpReq -Value $payload -Encoding ascii

        & curl.exe -sS --digest -u "${Username}:${Password}" `
            -H "Content-Type: application/json" `
            -X POST `
            --data-binary "@$tmpReq" `
            --output $tmpRes `
            "http://${Ip}/ISAPI/AccessControl/UserInfo/Search?format=json" | Out-Null

        $response = Get-Content -Path $tmpRes -Raw -Encoding utf8
        if ([string]::IsNullOrWhiteSpace($response)) { break }

        $parsed = $response | ConvertFrom-Json
        $search = $parsed.UserInfoSearch
        if (-not $search) { break }

        if ($null -eq $totalMatches) {
            $totalMatches = [int]($search.totalMatches)
        }

        $pageUsers = @($search.UserInfo)
        if ($pageUsers.Count -eq 0) { break }
        $users += $pageUsers

        $position += $pageUsers.Count
        $pages += 1

        if ($totalMatches -gt 0 -and $position -ge $totalMatches) { break }
    }

    return @($users)
}

function Get-DeviceCards {
    param(
        [string]$Ip,
        [int]$PageSize,
        [int]$MaxPages
    )

    $cards = @()
    $position = 0
    $pages = 0
    $totalMatches = $null

    while ($pages -lt $MaxPages) {
        $payloadObj = @{
            CardInfoSearchCond = @{
                searchID = "smartroute-card-sync-$Ip"
                searchResultPosition = $position
                maxResults = $PageSize
            }
        }
        $payload = $payloadObj | ConvertTo-Json -Depth 8 -Compress

        $tmpReq = Join-Path $env:TEMP "smartroute-card-search-$($Ip.Replace('.', '-')).json"
        $tmpRes = Join-Path $env:TEMP "smartroute-card-search-res-$($Ip.Replace('.', '-')).json"
        Set-Content -Path $tmpReq -Value $payload -Encoding ascii

        & curl.exe -sS --digest -u "${Username}:${Password}" `
            -H "Content-Type: application/json" `
            -X POST `
            --data-binary "@$tmpReq" `
            --output $tmpRes `
            "http://${Ip}/ISAPI/AccessControl/CardInfo/Search?format=json" | Out-Null

        $response = Get-Content -Path $tmpRes -Raw -Encoding utf8
        if ([string]::IsNullOrWhiteSpace($response)) { break }

        $parsed = $response | ConvertFrom-Json
        $search = $parsed.CardInfoSearch
        if (-not $search) { break }

        if ($null -eq $totalMatches) {
            $totalMatches = [int]($search.totalMatches)
        }

        $pageCards = @($search.CardInfo)
        if ($pageCards.Count -eq 0) { break }
        $cards += $pageCards

        $position += $pageCards.Count
        $pages += 1

        if ($totalMatches -gt 0 -and $position -ge $totalMatches) { break }
    }

    return @($cards)
}

$bestByExternalId = @{}
$summary = @()

foreach ($device in $devices) {
    $ip = $device.Ip
    $name = $device.Name
    $usersRead = 0
    $cardsRead = 0
    $cardsMapped = 0
    $status = "OK"

    try {
        $users = Get-DeviceUsers -Ip $ip -PageSize $PageSize -MaxPages $MaxPages
        foreach ($user in $users) {
            $externalId = Normalize-ExternalId -Value $user.employeeNo
            $fullName = Normalize-Name -Value $user.name
            if ([string]::IsNullOrWhiteSpace($externalId) -or [string]::IsNullOrWhiteSpace($fullName)) { continue }

            $usersRead += 1
            Upsert-BestIdentity -Map $bestByExternalId -ExternalId $externalId -FullName $fullName -SourceIp $ip | Out-Null
        }
    }
    catch {
        $status = "USER_ERROR"
    }

    try {
        $cards = Get-DeviceCards -Ip $ip -PageSize $PageSize -MaxPages $MaxPages
        foreach ($card in $cards) {
            $cardsRead += 1

            $cardExternalId = Normalize-ExternalId -Value $card.cardNo
            $employeeExternalId = Normalize-ExternalId -Value $card.employeeNo
            if ([string]::IsNullOrWhiteSpace($cardExternalId) -or [string]::IsNullOrWhiteSpace($employeeExternalId)) {
                continue
            }

            if (-not $bestByExternalId.ContainsKey($employeeExternalId)) {
                continue
            }

            $employeeIdentity = $bestByExternalId[$employeeExternalId]
            $updated = Upsert-BestIdentity `
                -Map $bestByExternalId `
                -ExternalId $cardExternalId `
                -FullName $employeeIdentity.fullName `
                -SourceIp $ip
            if ($updated) {
                $cardsMapped += 1
            }
        }
    }
    catch {
        if ($status -eq "OK") {
            $status = "CARD_ERROR"
        }
        else {
            $status = "USER_CARD_ERROR"
        }
    }

    $summary += [pscustomobject]@{
        Device = $name
        Ip = $ip
        UsersRead = $usersRead
        CardsRead = $cardsRead
        CardsMapped = $cardsMapped
        Status = $status
    }
}

$payloadItems = @()
foreach ($entry in $bestByExternalId.Values) {
    $payloadItems += @{
        externalId = $entry.externalId
        fullName = $entry.fullName
        sourceIp = $entry.sourceIp
    }
}

$backendUrl = "http://${BackendHost}:${BackendPort}/integrations/hikvision/identities/bulk"
$batchSize = 200
$totalCreated = 0
$totalUpdated = 0
$totalApplied = 0
$totalSkipped = 0

for ($i = 0; $i -lt $payloadItems.Count; $i += $batchSize) {
    $end = [Math]::Min($i + $batchSize - 1, $payloadItems.Count - 1)
    $batch = $payloadItems[$i..$end]
    $backendPayload = @{
        items = $batch
        applyToLogs = $true
    } | ConvertTo-Json -Depth 8

    $result = Invoke-RestMethod -Method Post -Uri $backendUrl -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($backendPayload))
    $totalCreated += [int]($result.created)
    $totalUpdated += [int]($result.updated)
    $totalApplied += [int]($result.appliedToLogs)
    $totalSkipped += [int]($result.skipped)
}

Write-Host ""
Write-Host "Device summary:"
$summary | Format-Table -AutoSize

Write-Host ""
Write-Host "Backend sync result:"
@{
    ok = $true
    total = $payloadItems.Count
    created = $totalCreated
    updated = $totalUpdated
    appliedToLogs = $totalApplied
    skipped = $totalSkipped
} | ConvertTo-Json -Depth 6

