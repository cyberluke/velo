# Creates a "NAI E-Mail — Calendar" shortcut on the Windows desktop.
#
# The shortcut launches the app with the single argument `naiemail://calendar`:
#   - app already running  -> single-instance forwards the URL, the running
#     window is shown/focused/maximized and the Calendar tab opens;
#   - app not running      -> the deep-link plugin reads the URL from the
#     command line on startup and the same thing happens after launch.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/desktop-calendar.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/desktop-calendar.ps1 -ExePath "D:\apps\NAI E-Mail\NAI-E-Mail.exe"
#
# Re-running is safe: it overwrites the existing shortcut.

param(
    [string]$ExePath = "",
    [string]$DesktopPath = ""
)

$ErrorActionPreference = "Stop"

function Find-AppExe {
    if ($ExePath -and (Test-Path -LiteralPath $ExePath)) { return $ExePath }

    # Standard per-user NSIS install location
    $candidate = Join-Path $env:LOCALAPPDATA "Programs\NAI E-Mail\NAI-E-Mail.exe"
    if (Test-Path -LiteralPath $candidate) { return $candidate }

    # Uninstall registry entries (per-user and per-machine)
    $roots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        foreach ($key in Get-ItemProperty -Path $root -ErrorAction SilentlyContinue) {
            if ($key.DisplayName -like "NAI E-Mail*" -and $key.InstallLocation) {
                $exe = Join-Path $key.InstallLocation "NAI-E-Mail.exe"
                if (Test-Path -LiteralPath $exe) { return $exe }
            }
        }
    }
    throw "NAI E-Mail executable not found. Pass -ExePath <path\to\NAI-E-Mail.exe>."
}

$exe = Find-AppExe
$desktop = if ($DesktopPath) { $DesktopPath } else {
    [Environment]::GetFolderPath("Desktop")
}
$shortcutPath = Join-Path $desktop "NAI E-Mail - Calendar.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exe
$shortcut.Arguments = "naiemail://calendar"
$shortcut.WorkingDirectory = Split-Path -Parent $exe
$shortcut.IconLocation = "$exe,0"
$shortcut.Description = "Open NAI E-Mail and show the Calendar tab"
$shortcut.Save()

Write-Output "Created: $shortcutPath"
Write-Output "Target:  $exe"
Write-Output "Arg:     naiemail://calendar (focus + maximize + Calendar tab, cold or warm start)"