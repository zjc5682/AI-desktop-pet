"""
services/emotion_service.py
情感分析服务
封装情感模型的推理逻辑
"""

import torch
from utils.model_loader import model_loader

class EmotionService:
    def __init__(self, config):
        self.model, self.tokenizer, self.label_encoder, self.id2label = model_loader.load_emotion_model()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        if self.model:
            self.model.to(self.device)
            self.model.eval()

    def predict(self, text: str):
        """预测文本的情感"""
        if not self.model or not self.tokenizer:
            return {"error": "模型加载失败"}

        try:
            inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512).to(self.device)
            with torch.no_grad():
                outputs = self.model(**inputs)

            pred_id = torch.argmax(outputs.logits, dim=1).item()

            # 安全获取标签
            if self.id2label:
                if pred_id in self.id2label:
                    label = self.id2label[pred_id]
                elif str(pred_id) in self.id2label:
                    label = self.id2label[str(pred_id)]
                else:
                    label = f"Unknown({pred_id})"
            else:
                label = f"Unknown({pred_id})"

            confidence = torch.softmax(outputs.logits, dim=1)[0][pred_id].item()

            return {
                "emotion_id": pred_id,
                "emotion_label": label,
                "confidence": round(confidence * 100, 2)
            }

        except Exception as e:
            print(f"❌ 情感分析失败: {e}")
            return {"error": str(e)}

    def analyze_emotion(self, text):
        """兼容旧接口"""
        return self.predict(text)
