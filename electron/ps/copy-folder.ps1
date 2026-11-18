param(
    [string]$DeviceId,
    [string]$SourceFolder,
    [string]$DestinationName
)

$ErrorActionPreference = "SilentlyContinue"
$ProgressPreference = "SilentlyContinue"

$shell = New-Object -ComObject Shell.Application
$pc    = $shell.NameSpace(0x11)

# Find device
$device = $pc.Items() | Where-Object { $_.Path -eq $DeviceId }
if (-not $device) {
    Write-Output "ERROR: Device not found"
    exit 1
}

$deviceFolder = $device.GetFolder()

# Find internal storage
$internal = $deviceFolder.Items() | Where-Object {
    $_.IsFolder -and $_.Name -match "Internal|Phone|Storage|shared"
}

if (-not $internal) {
    Write-Output "ERROR: Internal storage not found"
    exit 1
}

$internalFolder = $internal.GetFolder()

# ⭐ Instead of opening the destination folder,
# we build a virtual MTP path inside the internal storage root.
$virtualDest = "$($internal.Path)\$DestinationName"

# Copy files
$files = Get-ChildItem -Path $SourceFolder -File
$index = 0
$total = $files.Count

foreach ($f in $files) {
    # ⭐ Copy into internal storage root, specifying the folder name
    $internalFolder.CopyHere($f.FullName, 0x14)

    $index++
    $percent = [math]::Floor(($index / $total) * 100)
    Write-Output "PROGRESS:$percent"
}

Write-Output "DONE"
