@echo off
echo ========================================
echo 启动桌面宠物应用
echo ========================================
echo.

echo [1/3] 启动后端 WebSocket 服务器...
cd /d "%~dp0backend-python"
start "Backend" cmd /k python websocket_server.py

echo.
echo [2/3] 等待后端启动...
timeout /t 3 /nobreak > nul

echo.
echo [3/3] 启动前端和桌面应用...
cd /d "%~dp0apps\pet"
call pnpm tauri dev

echo.
echo 应用已退出
pause
