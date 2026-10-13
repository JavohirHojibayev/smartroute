@echo off
setlocal EnableExtensions
echo Configuring secondary IPv4 addresses on Ethernet for Hikvision Turnstile subnets (192.168.0.x/24 and 192.168.1.x/24)...

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

netsh interface ipv4 add address "Ethernet" 192.168.0.3 255.255.255.0
netsh interface ipv4 add address "Ethernet" 192.168.1.3 255.255.255.0
echo Done! Current IPv4 addresses on Ethernet:
netsh interface ipv4 show addresses "Ethernet"
pause

