# Сборка HaoticaTerminal-Setup.exe на Windows: venv → PyInstaller → Inno Setup.
#   powershell -ExecutionPolicy Bypass -File packaging\windows\build.ps1     (из корня репозитория)
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $root
if (-not (Test-Path .venv-build)) { py -3.12 -m venv .venv-build }
& .venv-build\Scripts\python.exe -m pip install --upgrade pip
& .venv-build\Scripts\python.exe -m pip install -r packaging\windows\requirements.txt pyinstaller
& .venv-build\Scripts\pyinstaller.exe packaging\windows\HaoticaTerminal.spec --noconfirm --distpath dist --workpath build
$ver = (Get-Content VERSION -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $ver) { $ver = "1.0.0" }
$iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Нет Inno Setup 6: winget install JRSoftware.InnoSetup" }
& $iscc "/DAppVersion=$ver" packaging\windows\installer.iss
Write-Output "Готово: dist\HaoticaTerminal-Setup.exe"
