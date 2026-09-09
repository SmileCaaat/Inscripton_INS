$ErrorActionPreference = "Stop"

# Shared dependency bootstrap for localhost and release scripts.
# Ensures npm packages and the Electron binary are present before continuing.

function Resolve-InsNodePath {
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

function Test-InsDependencyReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot,
        [switch]$ForDesktop
    )

    $required = @(
        "node_modules\vite\bin\vite.js",
        "node_modules\vinext\dist\cli.js",
        "node_modules\electron\install.js",
        "node_modules\electron-builder\cli.js"
    )
    if ($ForDesktop) {
        $required += @(
            "node_modules\electron\dist\electron.exe",
            "electron\main.cjs",
            "electron\preload.cjs",
            "public\ins-logo.png"
        )
    }

    foreach ($relative in $required) {
        if (-not (Test-Path (Join-Path $ProjectRoot $relative))) {
            return $false
        }
    }
    return $true
}

function Ensure-InsDependencies {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot,
        [Parameter(Mandatory = $true)]
        [string]$NodePath,
        [switch]$ForDesktop
    )

    $npmCmd = Join-Path (Split-Path $NodePath -Parent) "npm.cmd"
    if (-not (Test-Path $npmCmd)) {
        $npmCmd = "npm"
    }

    $needsInstall = -not (Test-Path (Join-Path $ProjectRoot "node_modules"))
    if (-not $needsInstall) {
        $probe = @(
            "node_modules\vite\bin\vite.js",
            "node_modules\vinext\dist\cli.js",
            "node_modules\electron\install.js",
            "node_modules\electron-builder\cli.js"
        )
        foreach ($relative in $probe) {
            if (-not (Test-Path (Join-Path $ProjectRoot $relative))) {
                $needsInstall = $true
                break
            }
        }
    }

    if ($needsInstall) {
        Write-Host "Installing project dependencies (this may take a few minutes)..." -ForegroundColor Cyan
        Push-Location $ProjectRoot
        try {
            & $npmCmd install --legacy-peer-deps
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed with exit code $LASTEXITCODE."
            }
        } finally {
            Pop-Location
        }
    }

    $electronExe = Join-Path $ProjectRoot "node_modules\electron\dist\electron.exe"
    $electronInstall = Join-Path $ProjectRoot "node_modules\electron\install.js"
    if ($ForDesktop -and -not (Test-Path $electronExe)) {
        if (-not (Test-Path $electronInstall)) {
            throw "Electron package is missing. Re-run npm install in $ProjectRoot."
        }
        Write-Host "Downloading Electron runtime binary..." -ForegroundColor Cyan
        & $NodePath $electronInstall
        if ($LASTEXITCODE -ne 0) {
            throw "Electron binary download failed with exit code $LASTEXITCODE."
        }
        if (-not (Test-Path $electronExe)) {
            throw "Electron binary is still missing at $electronExe after download."
        }
    }

    if (-not (Test-InsDependencyReady -ProjectRoot $ProjectRoot -ForDesktop:$ForDesktop)) {
        throw "Dependencies are still incomplete in $ProjectRoot. Check npm install output and retry."
    }

    Write-Host "Dependencies ready." -ForegroundColor DarkGray
}
