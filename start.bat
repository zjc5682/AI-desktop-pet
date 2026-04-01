@echo off
echo ========================================
echo 启动 AI Desktop Pet 桌面程序
echo ========================================
echo.
echo 当前入口: apps/pet (Tauri 桌面端)
echo 本地后端会由桌面程序按需自动拉起。
echo.

cd /d "%~dp0"
call pnpm dev
