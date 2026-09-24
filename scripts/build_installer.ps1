# ═══════════════════════════════════════════════════════════════
#  VPN Pro+  —  Build Windows App & Installer
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Building VPN Pro+ Windows App & Installer " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Pack the Electron application
Write-Host "`n[1/3] Packaging Electron app with electron-builder..." -ForegroundColor Yellow
npx electron-builder --dir

$AppExe = Join-Path $RootDir "dist\win-unpacked\VPN Pro+.exe"
if (-not (Test-Path $AppExe)) {
    Write-Error "Windows App executable was not generated at: $AppExe"
    exit 1
}
Write-Host " Successfully built Windows App at: $AppExe" -ForegroundColor Green

# Step 2: Verify embedded tunnel engine
Write-Host "`n[2/3] Verifying embedded VPN engine binaries..." -ForegroundColor Yellow
$EngineExe = Join-Path $RootDir "bin\engine\vpnengine.exe"
if (Test-Path $EngineExe) {
    Write-Host " Embedded VPN Engine verified at: $EngineExe" -ForegroundColor Green
} else {
    Write-Error "Embedded VPN engine not found at $EngineExe. Please ensure bin\engine\vpnengine.exe exists."
    exit 1
}

# Step 3: Find ISCC.exe and compile Inno Setup script
Write-Host "`n[3/3] Compiling installer with Inno Setup..." -ForegroundColor Yellow
$IsccCandidates = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)

$IsccPath = $null
foreach ($path in $IsccCandidates) {
    if (Test-Path $path) {
        $IsccPath = $path
        break
    }
}

if (-not $IsccPath) {
    $Cmd = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if ($Cmd) { $IsccPath = $Cmd.Source }
}

if (-not $IsccPath) {
    Write-Error "Inno Setup Compiler (ISCC.exe) was not found in Program Files or PATH."
    exit 1
}

Write-Host "Using ISCC at: $IsccPath" -ForegroundColor DarkGray
$IssPath = Join-Path $RootDir "installer\vpn_pro_plus.iss"

& "$IsccPath" "$IssPath"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Inno Setup compilation failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}

$InstallerExe = Join-Path $RootDir "installer\output\VPNProPlus_Setup_1.0.0.exe"
if (-not (Test-Path $InstallerExe)) {
    Write-Error "Installer executable was not found at: $InstallerExe"
    exit 1
}

# Also provide convenient copies as installer.exe
$RootInstaller = Join-Path $RootDir "installer.exe"
$DistInstaller = Join-Path $RootDir "dist\installer.exe"
Copy-Item -Path $InstallerExe -Destination $RootInstaller -Force
Copy-Item -Path $InstallerExe -Destination $DistInstaller -Force

$InstallerSize = (Get-Item $InstallerExe).Length / 1MB
Write-Host "`n========================================" -ForegroundColor Green
Write-Host " BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host " Windows App: $AppExe" -ForegroundColor White
Write-Host (" Installer:   $InstallerExe ({0:N2} MB)" -f $InstallerSize) -ForegroundColor White
Write-Host (" Shortcut:    $RootInstaller" ) -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
