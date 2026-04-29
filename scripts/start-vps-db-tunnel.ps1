param(
  [string]$VpsUser = "abdxl",
  [string]$VpsHost = "payspot.abdxl.cloud",
  [int]$LocalPort = 5433,
  [int]$RemotePort = 5433
)

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  Write-Error "OpenSSH client was not found. Install it from Windows Optional Features and try again."
  exit 1
}

Write-Host ""
Write-Host "Opening SSH tunnel for VPS Postgres..."
Write-Host "Local  : 127.0.0.1:$LocalPort"
Write-Host "Remote : 127.0.0.1:$RemotePort on $VpsUser@$VpsHost"
Write-Host ""
Write-Host "Keep this terminal open while reviewing the local app."
Write-Host ""

ssh -L "${LocalPort}:127.0.0.1:${RemotePort}" "$VpsUser@$VpsHost"
exit $LASTEXITCODE
