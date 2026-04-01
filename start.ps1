# 启动脚本 - 同时启动后端和前端

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "启动桌面宠物应用" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 获取脚本所在目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = $scriptDir

Write-Host "[1/3] 检查 Python 环境..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✓ Python 已安装: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Python 未安装或不在 PATH 中" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] 启动后端 WebSocket 服务器..." -ForegroundColor Yellow
$backendPath = Join-Path $projectRoot "backend-python\websocket_server.py"
$backendJob = Start-Job -ScriptBlock {
    param($path, $dir)
    Set-Location $dir
    python $path
} -ArgumentList $backendPath, $projectRoot

Write-Host "  ✓ 后端已在后台启动 (Job ID: $($backendJob.Id))" -ForegroundColor Green
Write-Host "  等待后端初始化..."
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[3/3] 启动前端和桌面应用..." -ForegroundColor Yellow
$frontendPath = Join-Path $projectRoot "apps\pet"
Set-Location $frontendPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "提示：" -ForegroundColor Cyan
Write-Host "  - 后端运行在端口 8766" -ForegroundColor White
Write-Host "  - 前端运行在端口 1420" -ForegroundColor White
Write-Host "  - 停止后端: Stop-Job -Id $($backendJob.Id)" -ForegroundColor White
Write-Host "  - 查看后端日志: Receive-Job -Id $($backendJob.Id)" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 启动 Tauri
& pnpm tauri dev

# 清理
Write-Host ""
Write-Host "正在停止后端服务..." -ForegroundColor Yellow
Stop-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
Remove-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
Write-Host "应用已退出" -ForegroundColor Green
