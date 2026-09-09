$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "ensure-deps.ps1")

$NodePath = Resolve-InsNodePath
$NodeDirectory = Split-Path $NodePath -Parent
$env:PATH = "$NodeDirectory;$ProjectRoot\node_modules\.bin;$env:PATH"
Set-Location $ProjectRoot

Ensure-InsDependencies -ProjectRoot $ProjectRoot -NodePath $NodePath -ForDesktop

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
