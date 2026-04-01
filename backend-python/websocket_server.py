"""
Minimal websocket backend for the desktop pet app.

Heavy ML services are optional. If their dependencies are missing, the
server still starts and returns structured fallback messages for those routes.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
from datetime import datetime

import websockets
import yaml

from services.chat_service import create_chat_service
from services.memory_service import create_memory_service
from services.screenshot_service import ScreenshotService
from services.vision_service import RealtimeVisionSession
from services.voice_service import (
    DEFAULT_SPEECH_LANGUAGE,
    DEFAULT_TTS_VOICE,
    RealtimeVoiceSession,
    VoiceSessionConfig,
    build_synthesizer,
)


class UnavailableService:
    def __init__(self, name: str, reason: str) -> None:
        self.name = name
        self.reason = reason

    def predict(self, text: str):
        return {'error': f'{self.name} is unavailable: {self.reason}'}

    def encode(self, text: str):
        return {'error': f'{self.name} is unavailable: {self.reason}'}

    def extract(self, image_base64: str, mime_type: str | None = None):
        _ = image_base64, mime_type
        return {'error': f'{self.name} is unavailable: {self.reason}'}


def build_optional_service(import_fn, name: str):
    try:
        return import_fn()
    except Exception as error:
        print(f'[warn] {name} disabled: {error}')
        return UnavailableService(name, str(error))


with open('config.yaml', 'r', encoding='utf-8') as file:
    config = yaml.safe_load(file)


def create_personality_service():
    from services.personality_service import PersonalityService

    return PersonalityService(config)


def create_emotion_service():
    from services.emotion_service import EmotionService

    return EmotionService(config)


def create_style_service():
    from services.style_service import StyleService

    return StyleService(config)


def create_screenshot_service():
    return ScreenshotService()


def create_memory_runtime_service():
    return create_memory_service(config)


personality_service = build_optional_service(
    create_personality_service,
    'personality service',
)
emotion_service = build_optional_service(
    create_emotion_service,
    'emotion service',
)
style_service = build_optional_service(
    create_style_service,
    'style service',
)
screenshot_service = build_optional_service(
    create_screenshot_service,
    'screenshot service',
)
memory_service = build_optional_service(
    create_memory_runtime_service,
    'memory service',
)
default_chat_service = create_chat_service(config)

MEMORY_ACTIONS = {
    'saveMessage': ('save_message', 'turn'),
    'searchRelevant': ('search_relevant', 'search'),
    'upsertProfileFact': ('upsert_profile_fact', 'fact'),
    'getProfileFacts': ('get_profile_facts', None),
    'getProfileSnapshot': ('get_profile_snapshot', None),
    'getRelationshipState': ('get_relationship_state', None),
    'getRuntimeStatus': ('get_runtime_status', None),
    'appendDiary': ('append_diary', 'entry'),
    'appendEventSummary': ('append_event_summary', 'event'),
    'getEventSummaries': ('get_event_summaries', 'limit'),
    'getConversation': ('get_conversation', 'sessionId'),
    'clearConversation': ('clear_conversation', 'sessionId'),
}


def resolve_chat_config(overrides):
    if not isinstance(overrides, dict):
        return config

    resolved = dict(config)
    qwen_local_config = dict(resolved.get('qwen_local') or {})

    provider = overrides.get('provider')
    if isinstance(provider, str) and provider:
        resolved['chat_provider'] = provider

    ollama_url = overrides.get('ollamaUrl')
    if isinstance(ollama_url, str) and ollama_url:
        resolved['ollama_url'] = ollama_url

    ollama_model = overrides.get('ollamaModel')
    if isinstance(ollama_model, str) and ollama_model:
        resolved['ollama_model'] = ollama_model

    temperature = overrides.get('temperature')
    if isinstance(temperature, (int, float)):
        resolved['temperature'] = float(temperature)

    max_tokens = overrides.get('maxTokens')
    if isinstance(max_tokens, int):
        resolved['max_tokens'] = max_tokens

    openai_base_url = overrides.get('openaiBaseUrl')
    if isinstance(openai_base_url, str) and openai_base_url:
        resolved['openai_base_url'] = openai_base_url

    openai_api_key = overrides.get('openaiApiKey')
    if isinstance(openai_api_key, str):
        resolved['openai_api_key'] = openai_api_key

    openai_model = overrides.get('openaiModel')
    if isinstance(openai_model, str) and openai_model:
        resolved['openai_model'] = openai_model

    zhipu_base_url = overrides.get('zhipuBaseUrl')
    if isinstance(zhipu_base_url, str) and zhipu_base_url:
        resolved['zhipu_base_url'] = zhipu_base_url

    zhipu_api_key = overrides.get('zhipuApiKey')
    if isinstance(zhipu_api_key, str):
        resolved['zhipu_api_key'] = zhipu_api_key

    zhipu_model = overrides.get('zhipuModel')
    if isinstance(zhipu_model, str) and zhipu_model:
        resolved['zhipu_model'] = zhipu_model

    qwen_local_model_path = overrides.get('qwenLocalModelPath')
    if isinstance(qwen_local_model_path, str) and qwen_local_model_path:
        qwen_local_config['model_path'] = qwen_local_model_path

    qwen_local_context_size = overrides.get('qwenLocalContextSize')
    if isinstance(qwen_local_context_size, int):
        qwen_local_config['n_ctx'] = qwen_local_context_size

    qwen_local_threads = overrides.get('qwenLocalThreads')
    if isinstance(qwen_local_threads, int):
        qwen_local_config['n_threads'] = qwen_local_threads

    qwen_local_gpu_layers = overrides.get('qwenLocalGpuLayers')
    if isinstance(qwen_local_gpu_layers, int):
        qwen_local_config['n_gpu_layers'] = qwen_local_gpu_layers

    if qwen_local_config:
        resolved['qwen_local'] = qwen_local_config

    search_enabled = overrides.get('searchEnabled')
    if isinstance(search_enabled, bool):
        resolved['search_enabled'] = search_enabled

    search_provider = overrides.get('searchProvider')
    if isinstance(search_provider, str) and search_provider:
        resolved['search_provider'] = search_provider

    search_max_results = overrides.get('searchMaxResults')
    if isinstance(search_max_results, int):
        resolved['search_max_results'] = search_max_results

    return resolved


def resolve_chat_service(overrides):
    if not isinstance(overrides, dict) or not overrides:
        return default_chat_service

    return create_chat_service(resolve_chat_config(overrides))


def resolve_tts_preview_config(runtime_config):
    if not isinstance(runtime_config, dict):
        runtime_config = {}

    return VoiceSessionConfig(
        tts_provider=str(runtime_config.get('ttsProvider') or 'edge-tts'),
        speech_language=str(
            runtime_config.get('speechLanguage') or DEFAULT_SPEECH_LANGUAGE
        ),
        tts_voice=str(runtime_config.get('ttsVoice') or DEFAULT_TTS_VOICE),
        vibevoice_tts_url=str(runtime_config.get('vibeVoiceTtsUrl') or ''),
        gpt_sovits_url=str(runtime_config.get('gptSovitsUrl') or ''),
        gpt_sovits_reference_audio=str(
            runtime_config.get('gptSovitsReferenceAudio') or ''
        ),
        gpt_sovits_prompt_text=str(runtime_config.get('gptSovitsPromptText') or ''),
        gpt_sovits_prompt_language=str(
            runtime_config.get('gptSovitsPromptLanguage')
            or DEFAULT_SPEECH_LANGUAGE
        ),
    )


async def synthesize_tts_preview(text, runtime_config):
    preview_text = str(text or '').strip()
    if not preview_text:
        return {'error': 'TTS preview text is empty.'}

    preview_config = resolve_tts_preview_config(runtime_config)
    synthesizer = build_synthesizer(preview_config)
    if not getattr(synthesizer, 'available', False):
        return {
            'error': (
                f"TTS provider {preview_config.tts_provider} is unavailable: "
                f"{getattr(synthesizer, 'reason', 'unavailable')}"
            )
        }

    stream_audio = getattr(synthesizer, 'stream_audio', None)
    if callable(stream_audio):
        audio_chunks = []
        mime_type = 'audio/mpeg'
        audio_format = ''
        sample_rate = None

        try:
            async for payload in stream_audio(
                preview_text,
                voice=preview_config.tts_voice,
                language=preview_config.speech_language,
            ):
                if not isinstance(payload, dict):
                    continue

                audio_bytes = payload.get('audio_bytes') or b''
                if isinstance(audio_bytes, bytearray):
                    audio_bytes = bytes(audio_bytes)
                if not isinstance(audio_bytes, bytes) or not audio_bytes:
                    continue

                audio_chunks.append(audio_bytes)
                mime_type = str(payload.get('mime_type') or mime_type)
                audio_format = str(payload.get('audio_format') or audio_format)

                next_sample_rate = payload.get('sample_rate')
                if isinstance(next_sample_rate, (int, float)):
                    sample_rate = int(next_sample_rate)
        except Exception as error:
            return {
                'error': (
                    f"TTS provider {getattr(synthesizer, 'name', preview_config.tts_provider)} "
                    f"failed: {error}"
                )
            }

        merged_audio = b''.join(audio_chunks)
        if not merged_audio:
            return {
                'error': (
                    f"TTS provider {getattr(synthesizer, 'name', preview_config.tts_provider)} "
                    'returned no audio.'
                )
            }

        return {
            'audio_bytes': merged_audio,
            'mime_type': mime_type,
            'audio_format': audio_format,
            'sample_rate': sample_rate,
        }

    try:
        audio_bytes, mime_type = await synthesizer.synthesize(
            preview_text,
            voice=preview_config.tts_voice,
            language=preview_config.speech_language,
        )
    except Exception as error:
        return {
            'error': (
                f"TTS provider {getattr(synthesizer, 'name', preview_config.tts_provider)} "
                f"failed: {error}"
            )
        }

    if not audio_bytes:
        return {
            'error': (
                f"TTS provider {getattr(synthesizer, 'name', preview_config.tts_provider)} "
                'returned no audio.'
            )
        }

    return {
        'audio_bytes': audio_bytes,
        'mime_type': mime_type,
        'audio_format': '',
        'sample_rate': None,
    }


async def handle_memory_request(action, payload):
    if not isinstance(payload, dict):
        payload = {}

    if not isinstance(action, str) or action not in MEMORY_ACTIONS:
        raise ValueError(f'Unknown memory action: {action}')

    method_name, argument_key = MEMORY_ACTIONS[action]
    method = getattr(memory_service, method_name, None)
    if not callable(method):
        raise RuntimeError(f'Memory service action {action} is unavailable.')

    if argument_key is None:
        return await asyncio.to_thread(method)

    if argument_key == 'turn':
        return await asyncio.to_thread(method, payload.get('turn') or {})
    if argument_key == 'fact':
        return await asyncio.to_thread(method, payload.get('fact') or {})
    if argument_key == 'entry':
        return await asyncio.to_thread(method, payload.get('entry') or {})
    if argument_key == 'event':
        return await asyncio.to_thread(method, payload.get('event') or {})
    if argument_key == 'search':
        return await asyncio.to_thread(
            method,
            str(payload.get('query') or ''),
            payload.get('options') if isinstance(payload.get('options'), dict) else {},
        )
    if argument_key == 'sessionId':
        return await asyncio.to_thread(method, str(payload.get('sessionId') or 'default'))
    if argument_key == 'limit':
        return await asyncio.to_thread(method, int(payload.get('limit') or 20))

    return await asyncio.to_thread(method, payload)


async def handler(websocket):
    print('[connect] client connected')
    voice_session = None
    vision_session = None
    outbound_queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def emit_event(event: dict):
        await outbound_queue.put(event)

    async def emit_events(events):
        for event in events:
            await emit_event(event)

    async def sender():
        while True:
            event = await outbound_queue.get()
            if event is None:
                return

            try:
                await websocket.send(json.dumps(event, ensure_ascii=False))
            except websockets.ConnectionClosed:
                return

    sender_task = asyncio.create_task(sender())

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get('type')

                if msg_type == 'personality':
                    result = personality_service.predict(data.get('text', ''))
                    await emit_event({'type': 'personality', 'result': result})
                    continue

                if msg_type == 'emotion':
                    result = emotion_service.predict(data.get('text', ''))
                    await emit_event({'type': 'emotion', 'result': result})
                    continue

                if msg_type == 'style':
                    result = style_service.encode(data.get('text', ''))
                    await emit_event({'type': 'style', 'vector': result})
                    continue

                if msg_type == 'chat':
                    text = data.get('message', '')
                    provider_config = data.get('providerConfig')
                    metadata = data.get('metadata')
                    chat_service = resolve_chat_service(provider_config)
                    await emit_event({'type': 'chat_start'})

                    full_response = ''
                    for chunk in chat_service.generate_stream(text, metadata=metadata):
                        full_response += chunk
                        await emit_event({'type': 'chat_chunk', 'content': chunk})

                    await emit_event({'type': 'chat_end', 'content': full_response})
                    continue

                if msg_type == 'memory_request':
                    request_id = str(data.get('requestId') or '').strip()
                    action = str(data.get('action') or '').strip()
                    if not request_id:
                        await emit_event(
                            {
                                'type': 'memory_response',
                                'requestId': '',
                                'action': action,
                                'ok': False,
                                'error': 'Memory request id is missing.',
                            }
                        )
                        continue

                    try:
                        result = await handle_memory_request(action, data.get('payload'))
                        await emit_event(
                            {
                                'type': 'memory_response',
                                'requestId': request_id,
                                'action': action,
                                'ok': True,
                                'result': result,
                            }
                        )
                    except Exception as error:
                        await emit_event(
                            {
                                'type': 'memory_response',
                                'requestId': request_id,
                                'action': action,
                                'ok': False,
                                'error': str(error),
                            }
                        )
                    continue

                if msg_type == 'voice_session_start':
                    voice_session = RealtimeVoiceSession(
                        config,
                        data.get('config'),
                        emit_event=emit_event,
                    )
                    await emit_events(voice_session.start())
                    continue

                if msg_type == 'voice_audio_chunk':
                    if voice_session is None:
                        await emit_event(
                            {'type': 'voice_error', 'message': 'Voice session is not started.'}
                        )
                        continue

                    events = await voice_session.process_audio_chunk(
                        pcm_base64=str(data.get('pcmBase64') or ''),
                        sample_rate=int(data.get('sampleRate') or 16000),
                        channels=int(data.get('channels') or 1),
                        capture_backend=str(data.get('captureBackend') or ''),
                    )
                    await emit_events(events)
                    continue

                if msg_type == 'voice_capture_overflow':
                    if voice_session is None:
                        continue

                    await emit_events(
                        voice_session.handle_capture_overflow(
                            dropped_chunks=int(data.get('droppedChunks') or 0),
                            queued_chunks=int(data.get('queuedChunks') or 0),
                        )
                    )
                    continue

                if msg_type == 'voice_playback_finished':
                    if voice_session is None:
                        continue

                    await emit_events(voice_session.finish_playback())
                    continue

                if msg_type == 'voice_session_stop':
                    if voice_session is None:
                        continue

                    await emit_events(voice_session.stop())
                    voice_session = None
                    continue

                if msg_type == 'tts_preview':
                    preview_result = await synthesize_tts_preview(
                        data.get('text'),
                        data.get('config'),
                    )
                    if preview_result.get('error'):
                        await emit_event(
                            {
                                'type': 'voice_error',
                                'message': str(preview_result.get('error')),
                            }
                        )
                        continue

                    event = {
                        'type': 'voice_tts_audio',
                        'state': 'speaking',
                        'audioBase64': base64.b64encode(
                            preview_result['audio_bytes']
                        ).decode('ascii'),
                    }
                    event['mimeType'] = str(preview_result.get('mime_type') or 'audio/mpeg')
                    audio_format = str(preview_result.get('audio_format') or '').strip()
                    if audio_format:
                        event['audioFormat'] = audio_format
                    sample_rate = preview_result.get('sample_rate')
                    if isinstance(sample_rate, int) and sample_rate > 0:
                        event['sampleRate'] = sample_rate
                    await emit_event(event)
                    continue

                if msg_type == 'vision_session_start':
                    vision_session = RealtimeVisionSession(config, data.get('config'))
                    await emit_events(vision_session.start())
                    continue

                if msg_type == 'vision_frame':
                    if vision_session is None:
                        await emit_event(
                            {'type': 'vision_error', 'message': 'Vision session is not started.'}
                        )
                        continue

                    events = await vision_session.process_frame(
                        image_base64=str(data.get('imageBase64') or ''),
                        mime_type=str(data.get('mimeType') or 'image/jpeg'),
                        width=int(data.get('width') or 0),
                        height=int(data.get('height') or 0),
                        timestamp=int(data.get('timestamp') or 0),
                    )
                    await emit_events(events)
                    continue

                if msg_type == 'vision_session_stop':
                    if vision_session is None:
                        continue

                    await emit_events(vision_session.stop())
                    vision_session = None
                    continue

                if msg_type == 'screenshot_translate':
                    image_base64 = str(data.get('imageBase64') or '')
                    mime_type = str(data.get('mimeType') or 'image/png')
                    target_language = str(data.get('targetLanguage') or 'zh-CN')
                    provider_config = data.get('providerConfig')
                    await emit_event({'type': 'screenshot_translate_start'})

                    ocr_result = screenshot_service.extract(image_base64, mime_type)
                    if isinstance(ocr_result, dict) and ocr_result.get('error'):
                        await emit_event(
                            {
                                'type': 'screenshot_translate_result',
                                'originalText': '',
                                'translatedText': '',
                                'lines': [],
                                'targetLanguage': target_language,
                                'error': str(ocr_result.get('error')),
                            }
                        )
                        continue

                    original_text = str(ocr_result.get('text') or '').strip()
                    translated_text = original_text

                    if original_text:
                        language_label = (
                            'Simplified Chinese' if target_language == 'zh-CN' else 'English'
                        )
                        translation_prompt = (
                            'Translate the following OCR text into '
                            f'{language_label}. Keep useful line breaks and UI terms. '
                            'Return only the translated text.\n\n'
                            f'OCR text:\n{original_text}'
                        )
                        translation_service = resolve_chat_service(provider_config)
                        translated_text = str(
                            translation_service.generate(
                                translation_prompt,
                                metadata={'userText': original_text},
                            )
                            or original_text
                        ).strip()

                    await emit_event(
                        {
                            'type': 'screenshot_translate_result',
                            'originalText': original_text,
                            'translatedText': translated_text,
                            'lines': ocr_result.get('lines') or [],
                            'targetLanguage': target_language,
                        }
                    )
                    continue

                await emit_event({'type': 'error', 'message': f'Unknown type: {msg_type}'})

            except Exception as error:
                print(f'[error] request handling failed: {error}')
                await emit_event({'type': 'error', 'message': str(error)})
    finally:
        if voice_session is not None:
            voice_session.stop()
        await outbound_queue.put(None)
        with contextlib.suppress(asyncio.CancelledError):
            await sender_task


async def main():
    print('[boot] websocket backend starting')
    print('[boot] listening on ws://127.0.0.1:8766')
    print('[boot] started at', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

    async with websockets.serve(handler, '127.0.0.1', 8766):
        print('[ready] websocket backend is running')
        await asyncio.Future()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print('\n[stop] websocket backend stopped')
    except Exception as error:
        print(f'[fatal] websocket backend failed: {error}')
