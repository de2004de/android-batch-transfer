param(
    [string]$DeviceId
)

$ErrorActionPreference = "SilentlyContinue"
$ProgressPreference = "SilentlyContinue"

$shell = New-Object -ComObject Shell.Application
$pc    = $shell.NameSpace(0x11)

# Find device
$device = $pc.Items() | Where-Object { $_.Path -eq $DeviceId }
if (-not $device) { Write-Output "[]"; exit }

$deviceFolder = $device.GetFolder()

# Find internal storage
$internal = $deviceFolder.Items() | Where-Object {
    $_.IsFolder -and $_.Name -match "Internal|Phone|Storage|shared"
}

if (-not $internal) { Write-Output "[]"; exit }

$internalFolder = $internal.GetFolder()

# List REAL folders
$folders = @()

foreach ($item in $internalFolder.Items()) {
    if ($item.IsFolder) {
        $folders += [PSCustomObject]@{
            Name        = $item.Name
            ParsingName = $item.ParsingName
        }
    }
}

$folders | ConvertTo-Json -Compress
