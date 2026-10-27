param(
  [Parameter(Mandatory = $true)][string]$Title,
  [switch]$Center,
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
trap {
  Write-Error ("Toast automation failed: {0}; stack: {1}" -f $_.Exception.Message, $_.ScriptStackTrace) -ErrorAction Continue
  exit 1
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OpenCodeToastInput {
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@

function Invoke-ScopedElement($Element) {
  $pattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
    $pattern.Invoke()
    return
  }
  $point = $Element.GetClickablePoint()
  [OpenCodeToastInput]::SetCursorPos([int]$point.X, [int]$point.Y) | Out-Null
  [OpenCodeToastInput]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [OpenCodeToastInput]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$buttonCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Open OpenCode')
$signatureCache = @{}
function Test-ShellNotificationWindow($Window) {
  if ($Window.Current.ClassName -ne 'Windows.UI.Core.CoreWindow') { return $false }
  $provider = Get-Process -Id $Window.Current.ProcessId -ErrorAction SilentlyContinue
  if ($null -eq $provider) { return $false }
  # Observed Windows notification hosts, never arbitrary applications with an
  # identical title/action. The newer host lives in System32; the legacy host
  # belongs to the Windows ShellExperienceHost package.
  $expected = switch ($provider.ProcessName) {
    'ShellHost' { Join-Path $env:windir 'System32\ShellHost.exe' }
    'ShellExperienceHost' { Join-Path $env:windir 'SystemApps\ShellExperienceHost_cw5n1h2txyewy\ShellExperienceHost.exe' }
    default { return $false }
  }
  if (-not [string]::Equals($provider.Path, $expected, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  if (-not $signatureCache.ContainsKey($expected)) {
    $signature = Get-AuthenticodeSignature -FilePath $expected
    $signatureCache[$expected] = $signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match '^CN=Microsoft Windows,'
  }
  return $signatureCache[$expected]
}
function Find-TaskAction {
  # Native toast providers can expose either a text child or a composite name.
  # Never print other notifications or use their action buttons as candidates.
  # Desktop-wide Descendants can omit hosted provider fragments. Start a fresh
  # search at each top-level window so XAML notification children are included.
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($window in $windows) {
    if (-not (Test-ShellNotificationWindow $window)) { continue }
    $all = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($element in $all) {
      # UIA snapshots can contain elements whose provider no longer supplies Name.
      $name = [string]$element.Current.Name
      if (-not $name.Contains($Title)) { continue }
      $parent = $element
      for ($depth = 0; $depth -lt 6 -and $null -ne $parent -and $parent -ne $root; $depth++) {
        $buttons = $parent.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
        if ($buttons.Count -eq 1 -and -not $buttons[0].Current.IsOffscreen) { return $buttons[0] }
        if ($buttons.Count -gt 1) { break }
        $parent = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($parent)
      }
    }
  }
  return $null
}

if ($SelfTest) {
  # Exercise real provider gating and action selection with duplicate content.
  # These fixtures supply no InvokePattern or mouse input implementation.
  $shellButton = [pscustomobject]@{ Current = [pscustomobject]@{ IsOffscreen = $false }; Marker = 'shell' }
  $text = [pscustomobject]@{ Current = [pscustomobject]@{ Name = $Title } }
  $text | Add-Member ScriptMethod FindAll { param($scope, $condition) Write-Output -NoEnumerate @($shellButton) }
  $shellWindow = [pscustomobject]@{ Current = [pscustomobject]@{ ProcessId = 100002; ClassName = 'Windows.UI.Core.CoreWindow' } }
  $shellWindow | Add-Member ScriptMethod FindAll { param($scope, $condition) return ,$text }
  # Code even spoofs the shell class and owns an identical title/button subtree.
  $codeButton = [pscustomobject]@{ Current = [pscustomobject]@{ IsOffscreen = $false }; Marker = 'code' }
  $codeText = [pscustomobject]@{ Current = [pscustomobject]@{ Name = $Title } }
  $codeText | Add-Member ScriptMethod FindAll { param($scope, $condition) Write-Output -NoEnumerate @($codeButton) }
  $codeWindow = [pscustomobject]@{ Current = [pscustomobject]@{ ProcessId = 100001; ClassName = 'Windows.UI.Core.CoreWindow' } }
  $codeWindow | Add-Member ScriptMethod FindAll { param($scope, $condition) return ,$codeText }
  $root = New-Object PSObject
  $root | Add-Member ScriptMethod FindAll { param($scope, $condition) return @($codeWindow, $shellWindow) }
  function Get-Process {
    param($Id, $ErrorAction)
    if ($Id -eq 100001) { return [pscustomobject]@{ ProcessName = 'Code'; Path = 'C:\fixture\Code.exe' } }
    if ($Id -eq 100002) { return [pscustomobject]@{ ProcessName = 'ShellHost'; Path = (Join-Path $env:windir 'System32\ShellHost.exe') } }
    throw 'Unexpected fixture process'
  }
  if ((Find-TaskAction).Marker -ne 'shell') { throw 'Shell action was not selected' }
  $root.PSObject.Methods.Remove('FindAll')
  $root | Add-Member ScriptMethod FindAll { param($scope, $condition) return ,$codeWindow }
  if ($null -ne (Find-TaskAction)) { throw 'Duplicate Code alert was accepted' }
  $nullText = [pscustomobject]@{ Current = [pscustomobject]@{ Name = $null } }
  $shellWindow.PSObject.Methods.Remove('FindAll')
  $shellWindow | Add-Member ScriptMethod FindAll { param($scope, $condition) return ,$nullText }
  $root.PSObject.Methods.Remove('FindAll')
  $root | Add-Member ScriptMethod FindAll { param($scope, $condition) return ,$shellWindow }
  if ($null -ne (Find-TaskAction)) { throw 'Nullable UIA Name was accepted' }
  Write-Output 'PASS: duplicate Code alert rejected, verified shell action selected, nullable Name ignored; no UI input performed'
  exit 0
}

if ($Center -and $null -eq (Find-TaskAction)) {
  [OpenCodeToastInput]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
  [OpenCodeToastInput]::keybd_event(0x4E, 0, 0, [UIntPtr]::Zero)
  [OpenCodeToastInput]::keybd_event(0x4E, 0, 2, [UIntPtr]::Zero)
  [OpenCodeToastInput]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
}
$deadline = [DateTime]::UtcNow.AddSeconds(18)
while ([DateTime]::UtcNow -lt $deadline) {
  $button = Find-TaskAction
  if ($null -ne $button) {
    Invoke-ScopedElement $button
    Write-Output 'Invoked task-owned toast action'
    exit 0
  }
  Start-Sleep -Milliseconds 300
}
throw 'Task-owned toast action was not accessible through UIAutomation; manual activation is required'
