param(
    [string]$BackendHost = "192.168.0.3",
    [int]$BackendPort = 3000,
    [string]$Username = "admin",
    [Parameter(Mandatory = $true)]
    [string]$Password
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

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path -Path $PSScriptRoot -ChildPath "turnstile-backups\$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

function Invoke-HikGet {
    param(
        [string]$Ip,
        [string]$Path
    )

    return & curl.exe -sS --digest -u "${Username}:${Password}" "http://${Ip}${Path}"
}

function Invoke-HikPutXml {
    param(
        [string]$Ip,
        [string]$Path,
        [string]$XmlFile
    )

    return & curl.exe -sS --digest -u "${Username}:${Password}" -X PUT -H "Content-Type: application/xml" --data-binary "@${XmlFile}" "http://${Ip}${Path}"
}

function Convert-ToXmlSafeQueryUrl {
    param(
        [string]$EventType,
        [string]$DeviceId,
        [string]$DeviceName
    )

    $eventTypeEscaped = [System.Uri]::EscapeDataString($EventType)
    $deviceIdEscaped = [System.Uri]::EscapeDataString($DeviceId)
    $deviceNameEscaped = [System.Uri]::EscapeDataString($DeviceName)

    $rawUrl = "/integrations/hikvision/webhook?eventType=${eventTypeEscaped}&deviceId=${deviceIdEscaped}&deviceName=${deviceNameEscaped}"
    return $rawUrl.Replace("&", "&amp;")
}

$results = @()

foreach ($device in $devices) {
    $ip = $device.Ip
    $name = $device.Name
    $eventType = $device.EventType
    $deviceId = $device.DeviceId

    try {
        $allBefore = Invoke-HikGet -Ip $ip -Path "/ISAPI/Event/notification/httpHosts"
        $slot1Before = Invoke-HikGet -Ip $ip -Path "/ISAPI/Event/notification/httpHosts/1"
        $slot2Before = Invoke-HikGet -Ip $ip -Path "/ISAPI/Event/notification/httpHosts/2"

        Set-Content -Path (Join-Path $backupDir "${ip}-httpHosts-before.xml") -Value $allBefore -Encoding ascii
        Set-Content -Path (Join-Path $backupDir "${ip}-slot1-before.xml") -Value $slot1Before -Encoding ascii
        Set-Content -Path (Join-Path $backupDir "${ip}-slot2-before.xml") -Value $slot2Before -Encoding ascii

        $xmlUrl = Convert-ToXmlSafeQueryUrl -EventType $eventType -DeviceId $deviceId -DeviceName $name
        $xmlBody = @"
<?xml version="1.0" encoding="UTF-8"?>
<HttpHostNotification version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<id>2</id>
<url>${xmlUrl}</url>
<protocolType>HTTP</protocolType>
<parameterFormatType></parameterFormatType>
<addressingFormatType>ipaddress</addressingFormatType>
<ipAddress>${BackendHost}</ipAddress>
<portNo>${BackendPort}</portNo>
<httpAuthenticationMethod></httpAuthenticationMethod>
</HttpHostNotification>
"@

        $tempXmlPath = Join-Path $backupDir "${ip}-slot2-put.xml"
        Set-Content -Path $tempXmlPath -Value $xmlBody -Encoding ascii

        $putResponse = Invoke-HikPutXml -Ip $ip -Path "/ISAPI/Event/notification/httpHosts/2" -XmlFile $tempXmlPath
        $slot2After = Invoke-HikGet -Ip $ip -Path "/ISAPI/Event/notification/httpHosts/2"
        Set-Content -Path (Join-Path $backupDir "${ip}-slot2-after.xml") -Value $slot2After -Encoding ascii

        $ok = [bool]($putResponse -match "<statusString>OK</statusString>")
        $results += [pscustomobject]@{
            Ip = $ip
            Name = $name
            Slot2Updated = $ok
        }
    }
    catch {
        $results += [pscustomobject]@{
            Ip = $ip
            Name = $name
            Slot2Updated = $false
        }
    }
}

$results | Format-Table -AutoSize
Write-Output ""
Write-Output "Backup folder: $backupDir"
