$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$phase = 321
try {
  $root = [IO.Path]::GetFullPath($env:TFA_MAINTENANCE_ROOT).TrimEnd('\')
  $old = Join-Path $root 'Uninstall TaskFlowApp.exe'
  $cu = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
  $phase = 322
  $install = $cu.OpenSubKey('Software\c791496c-2f51-5fc2-ac5c-b8a63e04e47a')
  $uninstall = $cu.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall\c791496c-2f51-5fc2-ac5c-b8a63e04e47a')
  if (-not $install -and -not $uninstall -and -not (Test-Path -LiteralPath $old)) {
    if (Test-Path -LiteralPath (Join-Path $root 'TaskFlowApp.exe')) { exit 31 }
    exit 0
  }
  if (-not $install -or -not $uninstall -or -not (Test-Path -LiteralPath $old)) { exit 31 }
  if ($install.GetValue('InstallLocation') -ne $root) { exit 31 }
  if ($uninstall.GetValue('UninstallString') -ne ('"' + $old + '" /currentuser')) { exit 31 }
  $item = Get-Item -LiteralPath $old -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 31 }
  $version = $uninstall.GetValue('DisplayVersion')
  # Legado nunca demanda extração/leitura do candidato para poder ser recusado.
  if ($version -ne $env:TFA_MAINTENANCE_VERSION -and $version -ne $env:TFA_PREDECESSOR_VERSION) { exit 31 }
  function HashFile([string]$file) {
    $stream = [IO.File]::OpenRead($file)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $algorithm.Dispose() }
  }
  $phase = 324
  $hash = HashFile $old
  $phase = 325
  $currentHash = HashFile $env:TFA_MAINTENANCE_CANDIDATE
  $same = $version -eq $env:TFA_MAINTENANCE_VERSION -and $hash -eq $currentHash
  $prior = $env:TFA_PREDECESSOR_HASH -and $hash -eq $env:TFA_PREDECESSOR_HASH -and $version -eq $env:TFA_PREDECESSOR_VERSION
  if (-not ($same -or $prior)) { exit 31 }
  if ($env:TFA_STAGED_OLD_UNINSTALLER) {
    if ((HashFile $env:TFA_STAGED_OLD_UNINSTALLER) -ne $hash) { exit 31 }
  }
  exit 0
} catch { exit $phase }
