$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Consulta somente leitura, antes da mutação e novamente no cleanup.
try {
  $root = [IO.Path]::GetFullPath($env:TFA_MAINTENANCE_ROOT).TrimEnd('\')
  $exe = Join-Path $root 'TaskFlowApp.exe'
  $link = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\TaskFlow App.lnk'
  $clsid = '{8B9BA547-6778-4F8E-873F-C3171C4EE08D}'
  $cu = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
  function Text($key, $name) {
    if ($null -eq $key) { return $null }
    $value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    if ($null -ne $value -and $value -isnot [string]) { throw 'type' }
    return $value
  }
  $installed = $cu.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall\c791496c-2f51-5fc2-ac5c-b8a63e04e47a')
  if ($installed) {
    $version = Text $installed 'DisplayVersion'
    if (-not $version -or [Version]$version -gt [Version]$env:TFA_MAINTENANCE_VERSION) { exit 21 }
    $installed.Close()
  }
  $family = $cu.OpenSubKey('Software\TaskFlow App\NativeIdentity')
  if ($family) {
    if (@($family.GetSubKeyNames() | Where-Object { $_ -ne 'v1' }).Count) { exit 21 }
    $family.Close()
  }
  $meta = $cu.OpenSubKey('Software\TaskFlow App\NativeIdentity\v1')
  if ($meta) {
    foreach ($pair in @(@('AUMID','taskflow.app'), @('CLSID',$clsid), @('InstalledExecutable',$exe), @('StartMenuLink',$link))) {
      if ((Text $meta $pair[0]) -ne $pair[1]) { exit 21 }
    }
    $meta.Close()
  }
  $server = $cu.OpenSubKey("Software\Classes\CLSID\$clsid\LocalServer32")
  if ($server) {
    if ((Text $server '') -ne $exe) { exit 21 }
    $server.Close()
  }
  if (Test-Path -LiteralPath $link) {
    $file = Get-Item -LiteralPath $link -Force
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 21 }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($link)
    if ($shortcut.TargetPath -ne $exe -or $shortcut.Arguments -ne '') { exit 21 }
    if ($shortcut.WorkingDirectory -ne '' -and $shortcut.WorkingDirectory -ne $root) { exit 21 }
    $explorer = New-Object -ComObject Shell.Application
    $item = $explorer.NameSpace($file.DirectoryName).ParseName($file.Name)
    if ($item.ExtendedProperty('System.AppUserModel.ID') -ne 'taskflow.app') { exit 21 }
    $activator = $item.ExtendedProperty('System.AppUserModel.ToastActivatorCLSID')
    if ($activator -and $activator -ne $clsid) { exit 21 }
  } elseif ($env:TFA_POST_INSTALL -eq '1') {
    exit 22
  }
  exit 0
} catch { exit 22 }
