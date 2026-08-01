$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-NodePath {
    $candidates = @()
    $command = Get-Command node.exe -All -ErrorAction SilentlyContinue
    if ($command) {
        $candidates += $command | ForEach-Object { $_.Source }
    }
    $candidates += @(
        (Join-Path $env:ProgramFiles "nodejs\node.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\node\node.exe"),
        (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe")
    )

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path $candidate)) {
            continue
        }
        $versionText = (& $candidate --version).Trim().TrimStart("v")
        try {
            $version = [version]$versionText
            if ($version.Major -ge 24) {
                return $candidate
            }
        } catch {
            continue
        }
    }

    throw "Node.js 24 or newer was not found. Install Node.js 24+ and run this script again."
}

$NodePath = Resolve-NodePath
$NodeDirectory = Split-Path $NodePath -Parent
$env:PATH = "$NodeDirectory;$ProjectRoot\node_modules\.bin;$env:PATH"
Set-Location $ProjectRoot

Write-Host "Starting INS Studio at http://localhost:3000/" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the development server." -ForegroundColor DarkGray
Write-Host ""

& $NodePath "$ProjectRoot\node_modules\vinext\dist\cli.js" dev
$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "The development server stopped with exit code $exitCode." -ForegroundColor Yellow
exit $exitCode
