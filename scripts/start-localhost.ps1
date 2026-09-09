$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "ensure-deps.ps1")

$NodePath = Resolve-InsNodePath
$NodeDirectory = Split-Path $NodePath -Parent
$env:PATH = "$NodeDirectory;$ProjectRoot\node_modules\.bin;$env:PATH"
Set-Location $ProjectRoot

Ensure-InsDependencies -ProjectRoot $ProjectRoot -NodePath $NodePath

Write-Host "Starting INS Studio at http://localhost:3000/" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the development server." -ForegroundColor DarkGray
Write-Host ""

& $NodePath "$ProjectRoot\node_modules\vinext\dist\cli.js" dev
$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "The development server stopped with exit code $exitCode." -ForegroundColor Yellow
exit $exitCode
