# FastAPI + Tauri 集成指南

## 📋 概述

本项目现在集成了 **FastAPI** Python 后端，提供强大的服务端功能，同时保留 Tauri 的原生桌面能力。

## 🏗️ 架构说明

```
┌─────────────────────────┐
│   Vue 3 前端            │
│   (Live2D 渲染)         │
├─────────────────────────┤
│   Tauri (Rust)          │
│   - 窗口管理            │
│   - 原生能力            │
└─────────────────────────┘
         ↕ HTTP 通信
┌─────────────────────────┐
│   FastAPI (Python)      │
│   - 业务逻辑            │
│   - AI/数据处理         │
└─────────────────────────┘
```

## 🚀 开发环境搭建

### 前置要求

1. **Node.js** >= 18
2. **Python** >= 3.9
3. **Rust** 工具链

### 安装步骤

#### 1. 安装 Python 依赖

```bash
cd src-tauri/python_backend
pip install -r requirements.txt
```

或使用 pnpm（如果已配置）:
```bash
pnpm install-python-deps
```

#### 2. 启动开发环境

**方式一：自动启动（推荐）**
```bash
pnpm tauri dev
```
这会自动启动 FastAPI 后端和 Tauri 前端。

**方式二：手动启动**

终端 1 - 启动 FastAPI:
```bash
cd src-tauri/python_backend
python main.py --port 8765
```

终端 2 - 启动 Tauri:
```bash
pnpm tauri dev
```

## 📡 API 使用示例

### 在前端调用 FastAPI

```typescript
import { useFastApi } from '@/composables/useFastApi'

const { feedPet, getPetStatus, chat } = useFastApi()

// 喂食宠物
const result = await feedPet('cake')
console.log(result.message) // "Fed the pet with cake"

// 获取状态
const status = await getPetStatus()
console.log(status.mood) // "happy"

// 聊天
const reply = await chat('你好！')
console.log(reply.reply) // "你好呀！有什么我可以帮你的吗？"
```

## 🔧 可用 API 端点

### GET `/api/pet/status`
获取宠物当前状态（心情、饥饿度、能量等）

### POST `/api/pet/feed?food_type={食物类型}`
喂食宠物

### POST `/api/pet/sleep?action={sleep|wake}`
切换睡眠状态

### GET `/api/pet/message?topic={主题}`
获取宠物消息

### POST `/api/chat`
与宠物聊天（传入 JSON: `{"user_message": "..."}`）

## 📦 构建发布版本

### Windows

```bash
# 1. 确保 Python 环境已安装
# 2. 构建应用
pnpm tauri build

# 输出位置：
# src-tauri/target/release/bundle/msi/my-desktop-pet_0.1.0_x64_en-US.msi
# src-tauri/target/release/bundle/nsis/my-desktop-pet_0.1.0_x64-setup.exe
```

### 重要提示

构建的应用会尝试启动 `python_backend/main.py`，因此需要：

1. **方案 A**：用户系统已安装 Python 3.9+
2. **方案 B**：将 Python 运行时打包进应用（见下方高级配置）

## 🎯 高级功能扩展

### 接入 AI 大模型

编辑 `src-tauri/python_backend/main.py`:

```python
@app.post("/api/chat")
async def chat_with_ai(user_message: str):
    """接入 OpenAI 或其他大模型"""
    import openai
    
    # 配置 API Key
    openai.api_key = "your-api-key"
    
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "你是一个可爱的桌面宠物助手"},
            {"role": "user", "content": user_message}
        ]
    )
    
    return {"reply": response.choices[0].message.content}
```

### 数据库支持

```python
# 安装依赖
# pip install sqlalchemy aiosqlite

from sqlalchemy import create_engine, Column, String, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class PetLog(Base):
    __tablename__ = 'pet_logs'
    id = Column(Integer, primary_key=True)
    action = Column(String)
    timestamp = Column(String)

# 在 API 中使用
@app.post("/api/log")
async def log_action(action: str):
    engine = create_engine('sqlite:///pet_data.db')
    Session = sessionmaker(bind=engine)
    session = Session()
    
    log = PetLog(action=action, timestamp=datetime.now().isoformat())
    session.add(log)
    session.commit()
    
    return {"success": True}
```

## ⚠️ 常见问题

### Q: Python 进程未启动？
A: 检查控制台输出，确认 `python` 命令可用。如使用虚拟环境，需激活环境。

### Q: CORS 错误？
A: 确保 `main.py` 中的 CORS 配置包含正确的域名（开发模式：`localhost:1420`，生产模式：`tauri://localhost`）

### Q: 构建后应用无法启动 Python？
A: 需要在打包时包含 Python 解释器，或使用 PyInstaller 单独打包 Python 部分。详见"独立部署"章节。

## 🔗 相关资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Tauri 进程管理](https://tauri.app/v1/guides/features/process/)
- [uvicorn 配置](https://www.uvicorn.org/settings/)

---

**下一步：**
- ✅ 测试 FastAPI 所有 API 端点
- ✅ 根据需求扩展业务逻辑
- ✅ 考虑是否需要打包 Python 运行时到最终应用
