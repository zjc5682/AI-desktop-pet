"""
Shared lazy model loader for optional ML services.
"""

from __future__ import annotations

from sentence_transformers import SentenceTransformer
from transformers import AutoModelForSequenceClassification, AutoTokenizer


class ModelLoader:
    """Singleton loader that avoids reloading heavyweight models."""

    _instance: 'ModelLoader | None' = None

    def __new__(cls) -> 'ModelLoader':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_models()
        return cls._instance

    def _init_models(self) -> None:
        self.models = {
            'personality': None,
            'emotion': None,
            'style_encoder': None,
        }
        self.tokenizers = {
            'personality': None,
            'emotion': None,
        }
        self.model_paths = {
            'personality': 'models/personality',
            'emotion': 'models/emotion',
            'style_encoder': 'models/style_encoder',
        }

    def load_personality_model(self):
        if self.models['personality'] is None:
            print('[model-loader] loading personality model...')
            try:
                self.tokenizers['personality'] = AutoTokenizer.from_pretrained(
                    self.model_paths['personality']
                )
                self.models['personality'] = (
                    AutoModelForSequenceClassification.from_pretrained(
                        self.model_paths['personality']
                    )
                )
                self.models['personality'].eval()
                print('[model-loader] personality model ready')
            except Exception as error:
                print(f'[model-loader] personality model load failed: {error}')
        return self.models['personality'], self.tokenizers['personality']

    def load_emotion_model(self):
        id2label = None
        if self.models['emotion'] is None:
            print('[model-loader] loading emotion model...')
            try:
                self.tokenizers['emotion'] = AutoTokenizer.from_pretrained(
                    self.model_paths['emotion']
                )
                self.models['emotion'] = AutoModelForSequenceClassification.from_pretrained(
                    self.model_paths['emotion']
                )
                self.models['emotion'].eval()

                emotion_labels = [
                    '高兴',
                    '悲伤',
                    '愤怒',
                    '恐惧',
                    '惊讶',
                    '厌恶',
                    '羞耻',
                    '焦虑',
                    '爱',
                    '恨',
                    '渴望',
                    '绝望',
                    '羡慕',
                ]
                id2label = {str(index): label for index, label in enumerate(emotion_labels)}
                self.models['emotion'].config.id2label = id2label
                self.models['emotion'].config.label2id = {
                    label: index for index, label in enumerate(emotion_labels)
                }
                print(
                    f'[model-loader] emotion model ready with {len(emotion_labels)} labels'
                )
            except Exception as error:
                print(f'[model-loader] emotion model load failed: {error}')
                id2label = None
        elif self.models['emotion'] is not None:
            id2label = getattr(self.models['emotion'].config, 'id2label', None)

        return self.models['emotion'], self.tokenizers['emotion'], None, id2label

    def load_style_encoder(self):
        if self.models['style_encoder'] is None:
            print('[model-loader] loading style encoder...')
            try:
                self.models['style_encoder'] = SentenceTransformer(
                    self.model_paths['style_encoder']
                )
                print('[model-loader] style encoder ready')
            except Exception as error:
                print(f'[model-loader] style encoder load failed: {error}')
        return self.models['style_encoder']

    def get_model(self, model_type: str):
        if model_type == 'personality':
            return self.load_personality_model()
        if model_type == 'emotion':
            return self.load_emotion_model()
        if model_type == 'style_encoder':
            return self.load_style_encoder()
        raise ValueError(f'Unknown model type: {model_type}')


model_loader = ModelLoader()
