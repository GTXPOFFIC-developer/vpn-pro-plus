# ═══════════════════════════════════════════════════════════════
#  VPN Pro+  —  Setup & Configure Virtual Adapter ("WAN")
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

# Ensure Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    $proc = Start-Process powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath) -Verb RunAs -PassThru
    $proc.WaitForExit()
    exit $proc.ExitCode
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir   = Split-Path -Parent $ScriptDir
$TargetAdapterName = "WAN"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " VPN Pro+ - Virtual Network Driver Setup " -ForegroundColor Cyan
Write-Host " Target Adapter Name: $TargetAdapterName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Check if "WAN" adapter already exists
$wanAdapter = Get-NetAdapter -Name $TargetAdapterName -ErrorAction SilentlyContinue
if ($wanAdapter) {
    Write-Host "Virtual network adapter '$TargetAdapterName' already exists (Interface: $($wanAdapter.InterfaceDescription))." -ForegroundColor Green
} else {
    Write-Host "Virtual network adapter '$TargetAdapterName' not found. Checking for existing TAP adapters..." -ForegroundColor Yellow
    
    # Check for TAP-Windows Adapter V9 (e.g., OpenVPN TAP-Windows6)
    $tapAdapter = Get-NetAdapter | Where-Object { 
        $_.InterfaceDescription -like "*TAP-Windows Adapter*" -or 
        $_.Name -eq "OpenVPN TAP-Windows6" -or
        $_.ComponentID -like "*tap0901*"
    } | Select-Object -First 1

    if ($tapAdapter) {
        Write-Host "Found existing TAP adapter: '$($tapAdapter.Name)'. Renaming to '$TargetAdapterName'..." -ForegroundColor Cyan
        try {
            Rename-NetAdapter -Name $tapAdapter.Name -NewName $TargetAdapterName -ErrorAction Stop
            Write-Host "Successfully renamed '$($tapAdapter.Name)' to '$TargetAdapterName'!" -ForegroundColor Green
        } catch {
            Write-Warning "Rename-NetAdapter failed. Attempting netsh rename..."
            & netsh interface set interface name="$($tapAdapter.Name)" newname="$TargetAdapterName"
        }
    } else {
        Write-Host "No existing TAP adapter found. Installing TAP-Windows driver..." -ForegroundColor Yellow
        $msiPath = Join-Path $RootDir "installer\deps\openvpn-install.msi"
        
        if (Test-Path $msiPath) {
            Write-Host "Installing TAP driver from: $msiPath" -ForegroundColor Cyan
            $msiArgs = @("/i", $msiPath, "ADDLOCAL=Drivers,Drivers.TAPWindows6", "/qn", "/norestart")
            $msiProcess = Start-Process msiexec.exe -ArgumentList $msiArgs -Wait -PassThru
            Write-Host "MSI installer exited with code: $($msiProcess.ExitCode)" -ForegroundColor DarkGray
            Start-Sleep -Seconds 3
        }

        # Check again after MSI installation
        $tapAdapterAfter = Get-NetAdapter | Where-Object { 
            $_.InterfaceDescription -like "*TAP-Windows Adapter*" -or 
            $_.Name -eq "OpenVPN TAP-Windows6" -or
            $_.ComponentID -like "*tap0901*"
        } | Select-Object -First 1

        if ($tapAdapterAfter) {
            Write-Host "Renaming newly installed adapter '$($tapAdapterAfter.Name)' to '$TargetAdapterName'..." -ForegroundColor Cyan
            Rename-NetAdapter -Name $tapAdapterAfter.Name -NewName $TargetAdapterName -ErrorAction SilentlyContinue
        } else {
            # Try tapctl if available
            $tapctlExe = Join-Path $RootDir "bin\engine\tapctl.exe"
            if (Test-Path $tapctlExe) {
                Write-Host "Attempting adapter creation via tapctl.exe..." -ForegroundColor Cyan
                & "$tapctlExe" create-adapter --name "$TargetAdapterName"
            }
        }
    }
}

# Step 2: Verification and adapter configuration
Start-Sleep -Seconds 1
$finalAdapter = Get-NetAdapter -Name $TargetAdapterName -ErrorAction SilentlyContinue

if (-not $finalAdapter) {
    # Check if any TAP adapter still exists with another name
    $fallbackTap = Get-NetAdapter | Where-Object { $_.InterfaceDescription -like "*TAP-Windows*" } | Select-Object -First 1
    if ($fallbackTap) {
        Write-Host "Found TAP adapter under name '$($fallbackTap.Name)'. Forcing rename to '$TargetAdapterName'..." -ForegroundColor Yellow
        Rename-NetAdapter -Name $fallbackTap.Name -NewName $TargetAdapterName -ErrorAction SilentlyContinue
        $finalAdapter = Get-NetAdapter -Name $TargetAdapterName -ErrorAction SilentlyContinue
    }
}

if ($finalAdapter) {
    # Ensure enabled
    Enable-NetAdapter -Name $TargetAdapterName -Confirm:$false -ErrorAction SilentlyContinue
    
    # Configure IPv4 MTU to 1500
    & netsh interface ipv4 set subinterface "$TargetAdapterName" mtu=1500 store=persistent | Out-Null
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " VIRTUAL ADAPTER READY: $TargetAdapterName" -ForegroundColor Green
    Write-Host " Description: $($finalAdapter.InterfaceDescription)" -ForegroundColor White
    Write-Host " Status:      $($finalAdapter.Status)" -ForegroundColor White
    Write-Host " MacAddress:  $($finalAdapter.MacAddress)" -ForegroundColor White
    Write-Host " LinkSpeed:   $($finalAdapter.LinkSpeed)" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Green
    exit 0
} else {
    Write-Error "Failed to locate or configure virtual adapter '$TargetAdapterName'. Please check Device Manager."
    exit 1
}
