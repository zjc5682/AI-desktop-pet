"""
backend-python/test_client.py
WebSocket 客户端测试脚本
用于测试 WebSocket 服务器连接
"""

import asyncio
import websockets
import json
from datetime import datetime

async def test_websocket():
    """
    测试 WebSocket 连接
    """
    uri = "ws://127.0.0.1:8766"  # 更新端口
    
    print(f"🔌 连接到 WebSocket 服务器: {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ 连接成功！\n")
            
            # 接收欢迎消息
            welcome = await websocket.recv()
            print(f"📥 收到欢迎消息: {welcome}\n")
            
            # 测试 1: 发送普通消息
            test_message_1 = {
                "type": "test",
                "message": "你好，WebSocket！",
                "timestamp": datetime.now().isoformat()
            }
            print(f"📤 发送测试消息 1: {json.dumps(test_message_1, ensure_ascii=False)}")
            await websocket.send(json.dumps(test_message_1, ensure_ascii=False))
            
            response_1 = await websocket.recv()
            print(f"📥 收到响应 1: {response_1}\n")
            
            # 测试 2: 发送 ping 命令
            test_message_2 = {
                "command": "ping"
            }
            print(f"📤 发送测试消息 2 (ping): {json.dumps(test_message_2)}")
            await websocket.send(json.dumps(test_message_2))
            
            response_2 = await websocket.recv()
            print(f"📥 收到响应 2: {response_2}\n")
            
            # 测试 3: 发送 status 命令
            test_message_3 = {
                "command": "status"
            }
            print(f"📤 发送测试消息 3 (status): {json.dumps(test_message_3)}")
            await websocket.send(json.dumps(test_message_3))
            
            response_3 = await websocket.recv()
            print(f"📥 收到响应 3: {response_3}\n")
            
            # 测试 4: 发送纯文本
            test_message_4 = "这是一条纯文本消息"
            print(f"📤 发送测试消息 4 (纯文本): {test_message_4}")
            await websocket.send(test_message_4)
            
            response_4 = await websocket.recv()
            print(f"📥 收到响应 4: {response_4}\n")
            
            # 测试 5: 性格预测
            test_message_5 = {
                "type": "personality",
                "text": "我喜欢冒险，喜欢尝试新事物，也喜欢和朋友一起聚会。"
            }
            print(f"📤 发送测试消息 5 (性格预测): {json.dumps(test_message_5, ensure_ascii=False)}")
            await websocket.send(json.dumps(test_message_5, ensure_ascii=False))
            
            response_5 = await websocket.recv()
            print(f"📥 收到响应 5 (性格预测): {response_5}\n")
            
            # 测试 6: 情感分析
            test_message_6 = {
                "type": "emotion",
                "text": "今天天气很好，心情非常愉快！"
            }
            print(f"📤 发送测试消息 6 (情感分析): {json.dumps(test_message_6, ensure_ascii=False)}")
            await websocket.send(json.dumps(test_message_6, ensure_ascii=False))
            
            response_6 = await websocket.recv()
            print(f"📥 收到响应 6 (情感分析): {response_6}\n")
            
            # 测试 7: 风格编码
            test_message_7 = {
                "type": "style",
                "text": "这是一段测试文本，用于风格编码。"
            }
            print(f"📤 发送测试消息 7 (风格编码): {json.dumps(test_message_7, ensure_ascii=False)}")
            await websocket.send(json.dumps(test_message_7, ensure_ascii=False))
            
            response_7 = await websocket.recv()
            print(f"📥 收到响应 7 (风格编码): {response_7}\n")
            
            print("✅ 所有测试完成！")
            
    except ConnectionRefusedError:
        print("❌ 连接失败：无法连接到服务器")
        print("💡 请确保 WebSocket 服务器正在运行：python websocket_server.py")
    except Exception as e:
        print(f"❌ 发生错误: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())
