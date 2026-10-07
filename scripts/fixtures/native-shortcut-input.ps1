param([Parameter(Mandatory=$true)][Int64]$TargetHandle,
      [Parameter(Mandatory=$true)][UInt32]$TargetProcess,
      [ValidateSet(0,20,21,22,23)][int]$FunctionKey = 0)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TfaNativeInput {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort vk; public ushort scan; public uint flags; public uint time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit, Size=40)] public struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT key; }
  public static INPUT Key(ushort vk, bool up) { return new INPUT { type=1, key=new KEYBDINPUT { vk=vk, flags=up?2u:0u } }; }
  public static bool Press(ushort vk) {
    var keys=new [] {Key(0x11,false),Key(0x10,false),Key(vk,false),Key(vk,true),Key(0x10,true),Key(0x11,true)};
    return SendInput((uint)keys.Length,keys,Marshal.SizeOf(typeof(INPUT))) == keys.Length;
  }
}
'@
$targetWindow = [IntPtr]::new($TargetHandle)
$windowProcess = [UInt32]0
[void][TfaNativeInput]::GetWindowThreadProcessId($targetWindow, [ref]$windowProcess)
if (-not [TfaNativeInput]::IsWindow($targetWindow) -or $windowProcess -ne $TargetProcess) { throw 'OWNED_WINDOW_MISMATCH' }
for ($attempt=0; $attempt -lt 10; $attempt++) {
  [void][TfaNativeInput]::SetForegroundWindow($targetWindow)
  Start-Sleep -Milliseconds 50
  if ([TfaNativeInput]::GetForegroundWindow() -eq $targetWindow) { break }
}
if ([TfaNativeInput]::GetForegroundWindow() -ne $targetWindow) { throw 'FOREGROUND_UNAVAILABLE' }
if ($FunctionKey -gt 0) {
  if (-not [TfaNativeInput]::Press([UInt16](0x70 + $FunctionKey - 1))) { throw 'SEND_INPUT_UNAVAILABLE' }
}
Write-Output 'OWNED_FOREGROUND_CONFIRMED'
