; installer.iss  —  Inno Setup 6 script for EVOQ Spec Translator
;
; Prerequisites:
;   1. Build the app first:  build.bat
;      Output must be in dist\NMSTranslator\
;   2. Install Inno Setup 6 from https://jrsoftware.org/isinfo.php
;   3. Either open this file in the Inno Setup IDE and press Compile,
;      or run:  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
;
; The resulting installer is placed in installer_output\
; and requires NO administrator rights to install.

#define AppName      "EVOQ Spec Translator"
#define AppVersion   "4.0"
#define AppPublisher "EVOQ Built Environment"
#define AppExeName   "NMSTranslator.exe"
#define AppURL       "https://evoq.ca"

[Setup]
AppId={{A3E7F2B1-4C8D-4E9A-B2F3-1D5E6C7A8B9F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={localappdata}\EvoqSpecTranslator
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=installer_output
OutputBaseFilename=EvoqSpecTranslator_Setup_v{#AppVersion}
SetupIconFile=evoq_icon.ico
WizardSmallImageFile=evoq_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
; No admin rights needed — installs to %LOCALAPPDATA%
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; Minimum Windows version: Windows 10
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french";  MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; \
  Description: "{cm:CreateDesktopIcon}"; \
  GroupDescription: "{cm:AdditionalIcons}"; \
  Flags: unchecked

[Files]
; The entire one-folder PyInstaller build output
Source: "dist\NMSTranslator\*"; \
  DestDir: "{app}"; \
  Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start Menu
Name: "{group}\{#AppName}"; \
  Filename: "{app}\{#AppExeName}"

; Desktop shortcut (optional, off by default)
Name: "{commondesktop}\{#AppName}"; \
  Filename: "{app}\{#AppExeName}"; \
  Tasks: desktopicon

; Uninstaller entry in Start Menu
Name: "{group}\Uninstall {#AppName}"; \
  Filename: "{uninstallexe}"

[Run]
; Offer to launch the app when the installer finishes
Filename: "{app}\{#AppExeName}"; \
  Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; \
  Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove the config/cache written by the app on uninstall
Type: filesandordirs; Name: "{localappdata}\NMSTranslator"
