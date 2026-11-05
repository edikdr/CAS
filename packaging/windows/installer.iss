; HAOTICA Terminal — установщик Inno Setup 6, на пользователя (без прав администратора).
;   iscc packaging\windows\installer.iss   (после PyInstaller: dist\HaoticaTerminal)
#define AppName "HAOTICA Terminal"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6E1F2C3A-7B4D-4C9E-9A11-3D5F0A7C2B19}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=HAOTICA
DefaultDirName={localappdata}\Programs\HAOTICA Terminal
DefaultGroupName=HAOTICA
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\..\dist
OutputBaseFilename=HaoticaTerminal-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ChangesEnvironment=yes
UninstallDisplayIcon={app}\HaoticaTerminal.exe
CloseApplications=yes

[Languages]
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Ярлык на рабочем столе"; Flags: unchecked
Name: "explorer"; Description: "Пункт «Открыть в HAOTICA Terminal» в меню Проводника"
Name: "path"; Description: "Команда haotica в PATH (haotica . — терминал в текущей папке)"
Name: "autostart"; Description: "Запускать при входе в Windows"; Flags: unchecked

[Files]
Source: "..\..\dist\HaoticaTerminal\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\HAOTICA Terminal"; Filename: "{app}\HaoticaTerminal.exe"
Name: "{group}\Диагностика HAOTICA"; Filename: "{app}\haotica.exe"; Parameters: "doctor"
Name: "{group}\HAOTICA Terminal (без видеокарты)"; Filename: "{app}\HaoticaTerminal.exe"; Parameters: "--safe-gfx"
Name: "{group}\Удалить HAOTICA Terminal"; Filename: "{uninstallexe}"
Name: "{userdesktop}\HAOTICA Terminal"; Filename: "{app}\HaoticaTerminal.exe"; Tasks: desktopicon

[Registry]
; «Открыть в HAOTICA Terminal» — на папке и на фоне папки (HKCU, без администратора)
Root: HKCU; Subkey: "Software\Classes\Directory\shell\HaoticaTerminal"; ValueType: string; ValueName: ""; ValueData: "Открыть в HAOTICA Terminal"; Flags: uninsdeletekey; Tasks: explorer
Root: HKCU; Subkey: "Software\Classes\Directory\shell\HaoticaTerminal"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\HaoticaTerminal.exe"; Tasks: explorer
Root: HKCU; Subkey: "Software\Classes\Directory\shell\HaoticaTerminal\command"; ValueType: string; ValueName: ""; ValueData: """{app}\HaoticaTerminal.exe"" terminal --cwd ""%V"" --new-tab"; Tasks: explorer
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\HaoticaTerminal"; ValueType: string; ValueName: ""; ValueData: "Открыть в HAOTICA Terminal"; Flags: uninsdeletekey; Tasks: explorer
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\HaoticaTerminal"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\HaoticaTerminal.exe"; Tasks: explorer
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\HaoticaTerminal\command"; ValueType: string; ValueName: ""; ValueData: """{app}\HaoticaTerminal.exe"" terminal --cwd ""%V"" --new-tab"; Tasks: explorer
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "HAOTICA Terminal"; ValueData: """{app}\HaoticaTerminal.exe"""; Flags: uninsdeletevalue; Tasks: autostart
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Check: NeedsAddPath(ExpandConstant('{app}')); Tasks: path

[Run]
Filename: "{app}\HaoticaTerminal.exe"; Description: "Запустить HAOTICA Terminal"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/f /im HaoticaTerminal.exe"; Flags: runhidden; RunOnceId: "KillTerminal"

[Code]
function NeedsAddPath(Param: string): boolean;
var OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(OrigPath) + ';') = 0;
end;
