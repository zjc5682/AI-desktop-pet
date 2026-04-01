# AI Desktop Pet

这是一个桌面优先的 AI 桌宠项目。

当前主结构：

- `apps/pet`：Tauri 2 + Vue 3 + Pinia 的桌面应用前端
- `backend-python`：本地 Python WebSocket 后端，负责聊天、语音、视觉、OCR 等能力
- `packages/*`：共享类型、配置、感知协议与运行时能力
- `public`：Live2D 运行时与模型静态资源

当前已经完成并接入运行态的重点能力：

- 桌面端主宠物窗口、设置窗口、视频通话窗口
- 本地后端自动探测与启动
- Ollama / 本地 Qwen / OpenAI / 智谱 的聊天后端切换框架
- 基础视觉链路：摄像头、人脸检测、粗表情、粗视线、基础手势
- 基础语音链路：本地 STT/TTS 接线、语音会话、打断、桌面播放
- 截图翻译正式链路的基础版
- 桌面服务：剪贴板分析、番茄钟、文件整理、系统状态轮询

快速开始：

```powershell
pnpm install
pnpm --filter @table-pet/pet setup:backend
pnpm dev
```

如果你使用 Python 3.11 的独立桌面感知/记忆环境，还可以执行：

```powershell
pnpm --filter @table-pet/pet setup:backend:perception
pnpm --filter @table-pet/pet setup:backend:memory
```

文档入口：

- [快速上手指南.md](./快速上手指南.md)
- [项目框架说明.md](./项目框架说明.md)
- [项目概况.md](./项目概况.md)
- [如何添加新功能.md](./如何添加新功能.md)

说明：

- 根目录旧浏览器入口已经清理，当前仅维护桌面端链路。
- Live2D 模型与第三方模型文件需要你自行准备或按文档放入指定路径。
- 某些高级能力仍依赖本地模型、外部服务地址或进一步训练，不是完全开箱即用。
