"""
services/personality_service.py
性格预测服务
封装性格模型的推理逻辑
"""

from utils.model_loader import model_loader
import torch

class PersonalityService:
    def __init__(self, config):
        self.model, self.tokenizer = model_loader.load_personality_model()
        self.personality_traits = [
            '开放性 (Openness)',
            '责任心 (Conscientiousness)',
            '外向性 (Extraversion)',
            '宜人性 (Agreeableness)',
            '神经质 (Neuroticism)'
        ]
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        if self.model:
            self.model.to(self.device)
            self.model.eval()

    def predict(self, text: str):
        """预测文本的性格特征"""
        if not self.model or not self.tokenizer:
            return {"error": "模型加载失败"}

        try:
            inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512).to(self.device)
            with torch.no_grad():
                outputs = self.model(**inputs)

            scores = torch.sigmoid(outputs.logits).squeeze().tolist()

            result = {}
            for i, trait in enumerate(self.personality_traits):
                if isinstance(scores, list):
                    result[trait] = round(scores[i] * 100, 2) if i < len(scores) else 0.0
                else:
                    result[trait] = round(scores * 100, 2)

            return result

        except Exception as e:
            print(f"❌ 性格预测失败: {e}")
            return {"error": str(e)}

    def predict_personality(self, text):
        """兼容旧接口"""
        return self.predict(text)
