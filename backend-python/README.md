# Backend Python - WebSocket 服务器

桌面宠物项目的 Python 后端服务，提供 WebSocket 通信功能。

## 环境要求

- Python 3.11+
- pip (Python 包管理器)

## 快速开始

### 1. 创建虚拟环境

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# Linux/macOS
python3 -m venv venv
source venv/bin/activate
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 启动 WebSocket 服务器

```bash
python websocket_server.py
```

服务器将在 `ws://127.0.0.1:8765` 启动。

### 4. 测试连接

在另一个终端中运行测试客户端：

```bash
python test_client.py
```

## 功能说明

### WebSocket Echo 服务

当前实现了一个简单的 Echo 服务器，功能包括：

- ✅ 接收客户端消息并返回 echo 响应
- ✅ 支持消息类型：welcome、echo、pong、status
- ✅ 支持命令：ping、status
- ✅ 支持纯文本和 JSON 格式消息

### 消息格式

#### 发送消息示例

```json
{
  "type": "test",
  "message": "你好，WebSocket！"
}
```

#### 响应消息示例

```json
{
  "type": "echo",
  "original_message": {
    "type": "test",
    "message": "你好，WebSocket！"
  },
  "reply": "收到你的消息: 你好，WebSocket！",
  "timestamp": "2026-03-31T12:34:56.789"
}
```

## 后续扩展

- [ ] 集成 AI 对话功能
- [ ] 添加数据库支持
- [ ] 实现用户认证
- [ ] 添加更多宠物互动功能
