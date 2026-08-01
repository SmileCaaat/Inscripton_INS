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

Write-Host "Building the INS Studio Windows release..." -ForegroundColor Cyan
Write-Host ""

& $NodePath "$ProjectRoot\node_modules\vite\bin\vite.js" build --config "$ProjectRoot\electron\vite.desktop.config.ts"
if ($LASTEXITCODE -ne 0) {
    throw "The desktop renderer build failed with exit code $LASTEXITCODE."
}

& $NodePath "$ProjectRoot\node_modules\electron-builder\cli.js" --projectDir "$ProjectRoot\electron" --win portable --x64
if ($LASTEXITCODE -ne 0) {
    throw "The Electron release build failed with exit code $LASTEXITCODE."
}

$Artifact = Join-Path $ProjectRoot "release\INS-Studio-0.1.0-Windows-x64.exe"
if (Test-Path $Artifact) {
    Write-Host ""
    Write-Host "Release created:" -ForegroundColor Green
    Write-Host $Artifact -ForegroundColor Green
} else {
    throw "The build completed but the expected release artifact was not found."
}
