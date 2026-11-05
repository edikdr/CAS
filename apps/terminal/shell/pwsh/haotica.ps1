# HAOTICA terminal ⇄ PowerShell (Windows PowerShell 5.1 и PowerShell 7+).
#   OSC 133 A/B/C/D — приглашение, конец приглашения, начало вывода, код выхода (блоки команд);
#   OSC 7           — текущая папка (файловая панель следует за cd);
#   OSC 7777        — текст команды (base64, UTF-8).
# Подключается после $PROFILE пользователя (терминал запускает: -NoExit -Command ". '<этот файл>'"),
# поэтому темы приглашения (oh-my-posh, starship) сохраняются: их prompt оборачивается, а не заменяется.
if ($env:TERM_PROGRAM -ne 'haotica' -or $global:__HyLoaded) { return }
$global:__HyLoaded = $true
$global:__HyE = [char]27
$global:__HyA = [char]7
$global:__HyRunning = $false
$global:__HyLecBefore = $global:LASTEXITCODE
try {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [Console]::OutputEncoding = $utf8
  [Console]::InputEncoding = $utf8
  $global:OutputEncoding = $utf8
} catch { }

function global:__HyOsc([string]$s) { "$($global:__HyE)]$s$($global:__HyA)" }

function global:__HyCwd {
  $loc = $ExecutionContext.SessionState.Path.CurrentLocation
  if ($loc.Provider.Name -ne 'FileSystem') { return '' }
  $p = $loc.ProviderPath -replace '\\', '/'
  $p = $p -replace '%', '%25' -replace ' ', '%20' -replace '#', '%23'
  if ($p -notmatch '^/') { $p = '/' + $p }
  __HyOsc "7;file://$env:COMPUTERNAME$p"
}

if (Test-Path Function:\prompt) { $global:__HyUserPrompt = (Get-Item Function:\prompt).ScriptBlock }
else { $global:__HyUserPrompt = { "PS $($ExecutionContext.SessionState.Path.CurrentLocation)$('>' * ($NestedPromptLevel + 1)) " } }

function global:prompt {
  $ok = $global:?
  $lec = $global:LASTEXITCODE
  $pre = ''
  if ($global:__HyRunning) {
    $code = 0
    if (-not $ok) {
      if ($lec -is [int] -and $lec -ne 0) { $code = $lec } else { $code = 1 }
    } elseif ($lec -is [int] -and $lec -ne 0 -and $lec -ne $global:__HyLecBefore) { $code = $lec }
    $pre += __HyOsc "133;D;$code"
    $global:__HyRunning = $false
  }
  $pre += __HyCwd
  $pre += __HyOsc '133;A'
  $user = & $global:__HyUserPrompt
  $global:LASTEXITCODE = $lec
  if ($null -eq $user) { $user = '' }
  return "$pre$user$(__HyOsc '133;B')"
}

# После Enter (PSReadLine уже вывел перевод строки): текст команды и начало вывода
if (Get-Module -Name PSReadLine) {
  function global:PSConsoleHostReadLine {
    $line = [Microsoft.PowerShell.PSConsoleReadLine]::ReadLine($Host.Runspace, $ExecutionContext)
    if ($line -and $line.Trim()) {
      $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($line))
      [Console]::Write("$($global:__HyE)]7777;cmd=$b64$($global:__HyA)$($global:__HyE)]133;C$($global:__HyA)")
      $global:__HyLecBefore = $global:LASTEXITCODE
      $global:__HyRunning = $true
    }
    $line
  }
}

# Haotica из строки: hy вопрос
function global:hy { & haotica ask ($args -join ' ') }
