$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Código fixo incorporado ao NSIS como EncodedCommand; nenhum conteúdo de usuário
# é interpolado. Retorna somente códigos, nunca SID, paths ou detalhes de processos.
try {
  $root = [IO.Path]::GetFullPath($env:TFA_MAINTENANCE_ROOT).TrimEnd('\') + '\'
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $processes = @(Get-CimInstance Win32_Process -OperationTimeoutSec 5)
  foreach ($process in $processes) {
    $candidate = $process.Name -eq 'TaskFlowApp.exe'
    if ($process.ExecutablePath) {
      $file = [IO.Path]::GetFullPath($process.ExecutablePath)
      if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $candidate = $true }
    }
    if (-not $candidate) { continue }
    $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -OperationTimeoutSec 5
    if ($owner.ReturnValue -ne 0 -or -not $owner.Sid -or -not $process.ExecutablePath) { exit 12 }
    if ($owner.Sid -eq $sid -and $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { exit 11 }
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { exit 12 }
  }
  exit 0
} catch { exit 12 }
