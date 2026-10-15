param(
  [ValidateSet('start', 'status', 'stop')][string]$Action = 'start',
  [int]$Port = 5180,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$shareDirectory = Join-Path $projectDirectory '.gstack/tmp/share'
$runtimeFile = Join-Path $shareDirectory 'runtime.json'
New-Item -ItemType Directory -Force -Path $shareDirectory | Out-Null

function Read-RunningShare {
  if (Test-Path -LiteralPath $runtimeFile) {
    return Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
  }
  return $null
}
function Test-ShareProcess($ProcessId, $ExpectedText) {
  if (-not $ProcessId) { return $false }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  return $processInfo -and $processInfo.CommandLine -and $processInfo.CommandLine.Contains($ExpectedText)
}
$running = Read-RunningShare
if ($Action -eq 'status') {
  if ($running) {
    [pscustomobject]@{
      Url = $running.url
      ServerRunning = [bool](Test-ShareProcess $running.serverPid $projectDirectory)
      TunnelRunning = [bool](Test-ShareProcess $running.tunnelPid $shareDirectory)
    } | Format-List
  } else { Write-Output 'No sharing session has been started.' }
  exit 0
}
if ($Action -eq 'stop') {
  if ($running) {
    if (Test-ShareProcess $running.tunnelPid $shareDirectory) { Stop-Process -Id $running.tunnelPid }
    if (Test-ShareProcess $running.serverPid $projectDirectory) { Stop-Process -Id $running.serverPid }
    Remove-Item -LiteralPath $runtimeFile
  }
  Write-Output 'Sharing stopped. Uploaded files were preserved locally.'
  exit 0
}
if ($running -and ((Test-ShareProcess $running.serverPid $projectDirectory) -or (Test-ShareProcess $running.tunnelPid $shareDirectory))) {
  throw 'A sharing process is already running. Use status or stop first.'
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $Port is already in use. Choose another -Port."
}
Push-Location $projectDirectory
try {
  if (-not $SkipBuild) {
    & npm.cmd run build:app
    if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
  }
  if (-not (Test-Path 'cad/dist/studio.html') -or -not (Test-Path 'dist/cli.js')) {
    throw 'Run npm install, npm run cad:install and npm run build:app first.'
  }
  $cloudflareFile = Join-Path $shareDirectory 'cloudflared.exe'
  $expectedHash = '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'
  if (-not (Test-Path -LiteralPath $cloudflareFile)) {
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/cloudflared-windows-amd64.exe' -OutFile $cloudflareFile
  }
  if ((Get-FileHash -LiteralPath $cloudflareFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'Cloudflare download hash mismatch.'
  }
  $publicData = Join-Path $shareDirectory 'data'
  $nodePath = (Get-Command node.exe).Source
  $cliPath = Join-Path $projectDirectory 'dist/cli.js'
  # Public visitors use the free provider without borrowing this PC owner's HF login.
  $previousToken = $env:HF_TOKEN
  $previousTokenPath = $env:HF_TOKEN_PATH
  try {
    $env:HF_TOKEN = ''
    $env:HF_TOKEN_PATH = Join-Path $shareDirectory 'no-private-token'
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @("`"$cliPath`"", 'serve', '--isolated', '--dir', "`"$publicData`"", '--port', $Port, '--host', '127.0.0.1') -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $shareDirectory 'server.stdout.log') -RedirectStandardError (Join-Path $shareDirectory 'server.stderr.log')
  } finally {
    $env:HF_TOKEN = $previousToken
    $env:HF_TOKEN_PATH = $previousTokenPath
  }
  $tunnelProcess = $null
  try {
    $localUrl = "http://127.0.0.1:$Port"
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      try {
        $health = Invoke-RestMethod -Uri "$localUrl/healthz" -TimeoutSec 2
        if ($health.status -eq 'ok') { $ready = $true; break }
      } catch { Start-Sleep -Milliseconds 300 }
    }
    if (-not $ready) { throw 'Local server failed to start. See server.stderr.log.' }
    $configPath = Join-Path $shareDirectory 'tunnel.yml'
    Set-Content -LiteralPath $configPath -Value '{}' -Encoding ascii
    $tunnelLog = Join-Path $shareDirectory 'tunnel.stderr.log'
    $tunnelProcess = Start-Process -FilePath $cloudflareFile -ArgumentList @('tunnel', '--config', "`"$configPath`"", '--no-autoupdate', '--protocol', 'http2', '--url', $localUrl) -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $shareDirectory 'tunnel.stdout.log') -RedirectStandardError $tunnelLog
    $publicUrl = $null
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
      Start-Sleep -Milliseconds 500
      $tunnelProcess.Refresh()
      if ($tunnelProcess.HasExited) { throw 'Cloudflare exited. See tunnel.stderr.log.' }
      $match = [regex]::Match((Get-Content -LiteralPath $tunnelLog -Raw -ErrorAction SilentlyContinue) + '', 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($match.Success) { $publicUrl = $match.Value; break }
    }
    if (-not $publicUrl) { throw 'No sharing URL was issued. See tunnel.stderr.log.' }
    @{ url = $publicUrl; serverPid = $serverProcess.Id; tunnelPid = $tunnelProcess.Id; port = $Port; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $runtimeFile -Encoding utf8
    Write-Output "Share this URL: $publicUrl"
    Write-Output 'Keep this PC awake. To stop: npm run share:stop'
  } catch {
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id }
    if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id }
    throw
  }
} finally { Pop-Location }
