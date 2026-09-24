; ═══════════════════════════════════════════════════════════════
;  VPN Pro+  —  Inno Setup Installer Script
;  Packages the Electron app with embedded secure tunnel engine.
; ═══════════════════════════════════════════════════════════════

#define MyAppName      "VPN Pro+"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "ODS Inc."
#define MyAppURL       "https://github.com/odsinc/vpn-pro-plus"
#define MyAppExeName   "VPN Pro+.exe"

[Setup]
SourceDir=..
AppId={{B5F8C2D1-9A3E-4F7B-8C6D-2E1A0F3B5D7C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=installer\output
OutputBaseFilename=VPNProPlus_Setup_{#MyAppVersion}
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=LICENSE.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart";   Description: "Start VPN Pro+ when Windows starts"; GroupDescription: "Startup:"

[Files]
; Main Electron app with embedded engine (from electron-builder --dir output)
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Bundled OpenVPN TAP driver installer (extracted to temp, removed after install)
Source: "installer\deps\openvpn-install.msi"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall
; Bundled virtual driver configuration script
Source: "scripts\setup_virtual_driver.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}";    Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Auto-start on login (current user)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "VPNProPlus"; ValueData: """{app}\{#MyAppExeName}"""; \
  Flags: uninsdeletevalue; Tasks: autostart

[Run]
; 1. Silently install TAP-Windows driver from bundled MSI into Windows Device Manager
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\openvpn-install.msi"" ADDLOCAL=Drivers,Drivers.TAPWindows6 /qn /norestart"; StatusMsg: "Installing WAN virtual network driver..."; Flags: runhidden waituntilterminated

; 2. Configure virtual adapter: rename to 'WAN', set MTU to 1500, and enable
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\setup_virtual_driver.ps1"""; StatusMsg: "Configuring WAN virtual network adapter..."; Flags: runhidden waituntilterminated

; 3. Launch after install (inherit Setup's admin rights to satisfy requireAdministrator manifest)
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent runascurrentuser

[UninstallRun]
; Auto-start removal handled by Flags: uninsdeletevalue
