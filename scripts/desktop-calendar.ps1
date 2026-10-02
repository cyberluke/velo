# Creates "NAI E-Mail — Calendar" and "NAI E-Mail — Contacts" shortcuts on the
# Windows desktop. The installer already adds both to the Start Menu via
# src-tauri/installer/hooks.nsh (bundle.windows.nsis.installerHooks); this
# script is the manual equivalent for machines that did not get the shortcuts.
#
# Each shortcut launches the app with a single deep-link argument:
#   - app already running  -> single-instance forwards the URL, the running
#     window is shown/focused/maximized and the target tab opens;
#   - app not running      -> the deep-link plugin reads the URL from the
#     command line on startup and the same thing happens after launch.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/desktop-calendar.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/desktop-calendar.ps1 -ExePath "D:\apps\NAI E-Mail\NAI-E-Mail.exe"
#
# Re-running is safe: it overwrites the existing shortcuts.

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

$shell = New-Object -ComObject WScript.Shell

function New-AppShortcut {
    param(
        [string]$Name,
        [string]$Link
    )
    $shortcutPath = Join-Path $desktop "$Name.lnk"
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exe
    $shortcut.Arguments = $Link
    $shortcut.WorkingDirectory = Split-Path -Parent $exe
    $shortcut.IconLocation = "$exe,0"
    $shortcut.Description = "Open NAI E-Mail and show the $($Name -replace 'NAI E-Mail - ', '') view"
    $shortcut.Save()
    Write-Output "Created: $shortcutPath"
}

New-AppShortcut "NAI E-Mail - Calendar" "naiemail://calendar"
New-AppShortcut "NAI E-Mail - Contacts" "naiemail://contacts"

Write-Output "Target:  $exe"
Write-Output "Args:    naiemail://calendar / naiemail://contacts (focus + maximize + target tab, cold or warm start)"