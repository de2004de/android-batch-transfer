$ErrorActionPreference = "SilentlyContinue"
$ProgressPreference = "SilentlyContinue"

$shell = New-Object -ComObject Shell.Application
$pc    = $shell.NameSpace(0x11)

$items   = $pc.Items()
$devices = @()

foreach ($item in $items) {
    if ($item.IsFolder -and $item.Type -like "*Mobile*") {
        $devices += [PSCustomObject]@{
            Id   = $item.Path
            Name = $item.Name
            Type = $item.Type
        }
    }
}

$json = $devices | ConvertTo-Json -Compress
if ($json.Trim().StartsWith("{")) { $json = "[" + $json + "]" }
$json.Trim()
