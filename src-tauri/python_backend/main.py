# src-tauri/python_backend/main.py - FastAPI 后端主入口
"""
桌面宠物的 Python 后端服务
提供 AI 对话、数据管理等功能
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import sys
from typing import Optional

app = FastAPI(
    title="Desktop Pet Backend",
    description="API backend for Live2D desktop pet",
    version="0.1.0"
)

# 配置 CORS，允许 Tauri 前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",  # Tauri 开发模式
        "tauri://localhost",      # Tauri 生产模式
        "https://tauri.localhost" # Tauri v2 生产模式
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 模拟宠物状态
pet_state = {
    "is_sleeping": False,
    "mood": "happy",
    "hunger": 50,
    "energy": 80
}

@app.get("/")
async def root():
    """健康检查端点"""
    return {"status": "ok", "message": "FastAPI backend is running"}

@app.get("/api/pet/status")
async def get_pet_status():
    """获取宠物当前状态"""
    return pet_state

@app.post("/api/pet/feed")
async def feed_pet(food_type: str = "snack"):
    """喂食宠物"""
    if pet_state["is_sleeping"]:
        raise HTTPException(status_code=400, detail="Pet is sleeping!")
    
    # 更新状态
    pet_state["hunger"] = max(0, pet_state["hunger"] - 20)
    pet_state["mood"] = "happy"
    pet_state["energy"] = min(100, pet_state["energy"] + 10)
    
    return {
        "success": True,
        "message": f"Fed the pet with {food_type}",
        "new_status": pet_state
    }

@app.post("/api/pet/sleep")
async def toggle_sleep(action: str):
    """切换宠物睡眠状态"""
    if action == "sleep":
        pet_state["is_sleeping"] = True
        pet_state["energy"] = min(100, pet_state["energy"] + 30)
        message = "Pet is now sleeping 💤"
    else:
        pet_state["is_sleeping"] = False
        message = "Pet woke up! ☀️"
    
    return {
        "success": True,
        "message": message,
        "is_sleeping": pet_state["is_sleeping"]
    }

@app.get("/api/pet/message")
async def get_message(topic: Optional[str] = None):
    """获取宠物消息（可以接入 AI）"""
    messages = {
        "greeting": "你好呀！今天心情怎么样？",
        "hungry": "我有点饿了...能给我吃点东西吗？",
        "tired": "好困啊...我想睡觉了...",
        "happy": "和你在一起真开心！✨"
    }
    
    if topic and topic in messages:
        return {"message": messages[topic]}
    
    # 随机返回一个消息
    import random
    key = random.choice(list(messages.keys()))
    return {"message": messages[key], "type": key}

@app.post("/api/chat")
async def chat_with_pet(user_message: str):
    """与宠物聊天（可扩展接入 AI 大模型）"""
    # 这里可以实现简单的关键词匹配或接入 AI API
    responses = {
        "你好": "你好呀！有什么我可以帮你的吗？",
        "饿": "要不要一起找点吃的？我也想吃东西~",
        "累": "休息一下吧，不要太辛苦哦！",
        "开心": "看到你开心我也很开心！😊"
    }
    
    # 简单匹配
    for keyword, response in responses.items():
        if keyword in user_message:
            return {"reply": response}
    
    # 默认回复
    return {"reply": "嗯嗯，我在听呢！请继续说~"}

def run_server(host: str = "127.0.0.1", port: int = 8765):
    """启动 FastAPI 服务器"""
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    # 从命令行参数获取端口和主机
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    
    print(f"🚀 Starting FastAPI server on {args.host}:{args.port}")
    run_server(args.host, args.port)
