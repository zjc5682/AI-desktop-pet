$ErrorActionPreference = 'Stop'

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '启动 AI Desktop Pet 桌面程序' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host '当前入口: apps/pet (Tauri 桌面端)' -ForegroundColor Yellow
Write-Host '本地后端会由桌面程序按需自动拉起。' -ForegroundColor Yellow
Write-Host ''

pnpm dev
