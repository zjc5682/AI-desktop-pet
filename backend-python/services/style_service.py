"""
services/style_service.py
风格编码服务
封装风格编码器的推理逻辑
"""

from utils.model_loader import model_loader
import numpy as np

class StyleService:
    def __init__(self, config=None):
        """初始化服务"""
        self.model = model_loader.load_style_encoder()

    def encode(self, text):
        """对文本进行风格编码"""
        if not self.model:
            return {"error": "模型加载失败"}

        try:
            embeddings = self.model.encode(text)
            style_vector = embeddings.tolist()
            style_dim = len(style_vector)

            result = {
                "style_vector": style_vector,
                "dimension": style_dim,
                "mean": round(float(np.mean(embeddings)), 4),
                "std": round(float(np.std(embeddings)), 4)
            }

            return result

        except Exception as e:
            print(f"❌ 风格编码失败: {e}")
            return {"error": str(e)}

    def encode_style(self, text):
        """兼容旧接口"""
        return self.encode(text)
