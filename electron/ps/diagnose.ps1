$ErrorActionPreference = "SilentlyContinue"
$ProgressPreference = "SilentlyContinue"

Write-Output "=== MTP DIAGNOSTIC START ==="

$shell = New-Object -ComObject Shell.Application
$pc    = $shell.NameSpace(0x11)

Write-Output ""
Write-Output "=== DEVICES ==="

foreach ($item in $pc.Items()) {
    if ($item.IsFolder) {
        Write-Output "Device: $($item.Name)"
        Write-Output "  Path: $($item.Path)"
        Write-Output "  Type: $($item.Type)"
    }
}

Write-Output ""
Write-Output "=== INTERNAL STORAGE CANDIDATES ==="

foreach ($item in $pc.Items()) {
    if ($item.IsFolder -and $item.Type -like "*Mobile*") {
        $device = $item
        $deviceFolder = $device.GetFolder()

        foreach ($child in $deviceFolder.Items()) {
            if ($child.IsFolder) {
                Write-Output "Candidate: $($child.Name)"
                Write-Output "  Path: $($child.Path)"
                Write-Output "  Type: $($child.Type)"

                $folder = $child.GetFolder()
                $children = $folder.Items()

                Write-Output "  Child count: $($children.Count)"

                foreach ($sub in $children) {
                    Write-Output "    - $($sub.Name) (IsFolder=$($sub.IsFolder))"
                }

                Write-Output ""
            }
        }
    }
}

Write-Output ""
Write-Output "=== REAL INTERNAL STORAGE DETECTION ==="

foreach ($item in $pc.Items()) {
    if ($item.IsFolder -and $item.Type -like "*Mobile*") {
        $deviceFolder = $item.GetFolder()

        foreach ($child in $deviceFolder.Items()) {
            if ($child.IsFolder) {
                $folder = $child.GetFolder()
                $children = $folder.Items() | Where-Object { $_.IsFolder }

                if ($children.Count -gt 5) {
                    Write-Output "REAL INTERNAL STORAGE FOUND:"
                    Write-Output "  Name: $($child.Name)"
                    Write-Output "  Path: $($child.Path)"
                    Write-Output "  Child folders:"
                    foreach ($sub in $children) {
                        Write-Output "    - $($sub.Name)"
                    }
                    Write-Output ""
                }

                # Samsung nested case
                if ($children.Count -eq 1 -and $children.Item(0).IsFolder) {
                    $subFolder = $children.Item(0).GetFolder()
                    $subChildren = $subFolder.Items() | Where-Object { $_.IsFolder }

                    if ($subChildren.Count -gt 5) {
                        Write-Output "REAL INTERNAL STORAGE FOUND (nested):"
                        Write-Output "  Wrapper: $($child.Name)"
                        Write-Output "  Real root: $($children.Item(0).Name)"
                        Write-Output "  Child folders:"
                        foreach ($sub in $subChildren) {
                            Write-Output "    - $($sub.Name)"
                        }
                        Write-Output ""
                    }
                }
            }
        }
    }
}

Write-Output ""
Write-Output "=== MTP DIAGNOSTIC END ==="
