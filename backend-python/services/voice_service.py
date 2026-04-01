"""
Realtime voice session helpers for websocket_server.py.

The implementation keeps optional providers behind graceful fallbacks:
- VAD supports `silero-vad`, with RMS energy gating as fallback.
- STT supports `faster-whisper`, `openai-whisper`, or VibeVoice HTTP ASR.
- TTS supports `edge-tts`, VibeVoice HTTP TTS, or GPT-SoVITS HTTP TTS.
- Voice emotion supports transformers / Wav2Vec2 style audio classifiers.
"""

from __future__ import annotations

import asyncio
import audioop
import base64
from collections import deque
from collections.abc import Awaitable, Callable
import contextlib
import inspect
import json
import os
import re
import socket
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import wave
from dataclasses import dataclass, field
from typing import Any

from services.chat_service import create_chat_service

DEFAULT_SAMPLE_RATE = 16000
DEFAULT_SILENCE_MS = 720
DEFAULT_MIN_SPEECH_MS = 320
LOW_LATENCY_SILENCE_MS = 420
LOW_LATENCY_MIN_SPEECH_MS = 220
DEFAULT_ENERGY_THRESHOLD = 900
DEFAULT_WAKE_TIMEOUT_SECONDS = 20.0
DEFAULT_TTS_VOICE = 'zh-CN-XiaoxiaoNeural'
DEFAULT_SPEECH_LANGUAGE = 'zh'
DEFAULT_WAKE_WORD = '\u5c0f\u684c'
PARTIAL_TRANSCRIPT_MIN_AUDIO_MS = 1200
PARTIAL_TRANSCRIPT_INTERVAL_SECONDS = 1.4
LOW_LATENCY_PARTIAL_TRANSCRIPT_MIN_AUDIO_MS = 760
LOW_LATENCY_PARTIAL_TRANSCRIPT_INTERVAL_SECONDS = 0.85
STREAMING_PARTIAL_TRANSCRIPT_MIN_AUDIO_MS = 560
STREAMING_PARTIAL_TRANSCRIPT_INTERVAL_SECONDS = 0.45
PARTIAL_TRANSCRIPT_REUSE_MAX_AUDIO_DELTA_MS = 220
PARTIAL_TRANSCRIPT_REUSE_MAX_AGE_SECONDS = 1.8
PARTIAL_TRANSCRIPT_FORCE_DELTA_MS = 180
STREAMING_PARTIAL_TRANSCRIPT_FORCE_DELTA_MS = 120
INCREMENTAL_FINAL_TRANSCRIPT_MAX_TAIL_MS = 3200
INCREMENTAL_FINAL_TRANSCRIPT_MAX_AGE_SECONDS = 3.2
INCREMENTAL_FINAL_TRANSCRIPT_OVERLAP_MS = 320
INCREMENTAL_PARTIAL_TRANSCRIPT_MAX_TAIL_MS = 2400
INCREMENTAL_PARTIAL_TRANSCRIPT_MAX_AGE_SECONDS = 2.4
INCREMENTAL_PARTIAL_TRANSCRIPT_OVERLAP_MS = 240
PARTIAL_TRANSCRIPT_CHECKPOINT_LIMIT = 6
CONTINUOUS_ASR_COMPACT_MIN_AUDIO_MS = 2600
CONTINUOUS_ASR_COMPACT_KEEP_TAIL_MS = 900
CONTINUOUS_ASR_COMPACT_MIN_COMMIT_AUDIO_MS = 700
ENDPOINT_STABLE_HOLD_SECONDS = 0.28
ENDPOINT_PARTIAL_IDLE_SECONDS = 0.16
ENDPOINT_MIN_STABLE_AUDIO_MS = 720
ENDPOINT_SHORT_SILENCE_MS = 120
ENDPOINT_PUNCTUATION_SILENCE_MS = 60
ENDPOINT_MAX_UNSTABLE_UNITS = 3
LOW_LATENCY_EARLY_COMMIT_SILENCE_MS = 220
LOW_LATENCY_EARLY_COMMIT_MIN_SPEECH_MS = 720
TTS_STREAM_HARD_BREAK_CHARS = 32
PRE_SPEECH_BUFFER_MS = 180
VIBEVOICE_STREAM_POLL_SECONDS = 0.15
PARTIAL_TRANSCRIPT_PROMPT_WORD_LIMIT = 10
CORRUPTED_WAKE_WORD_MARKERS = ('\ufffd', '鐏', '灏', '闁', '閻', '椤', '缁', '顢')


def _clean_text(text: str) -> str:
    return ' '.join(text.strip().split())


def _build_partial_transcript_prompt(text: str) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ''

    words = cleaned.split()
    if len(words) <= PARTIAL_TRANSCRIPT_PROMPT_WORD_LIMIT:
        return cleaned

    return ' '.join(words[-PARTIAL_TRANSCRIPT_PROMPT_WORD_LIMIT:])


def _merge_incremental_transcript(prefix: str, delta: str) -> str:
    prefix_clean = _clean_text(prefix)
    delta_clean = _clean_text(delta)
    if not prefix_clean:
        return delta_clean
    if not delta_clean:
        return prefix_clean
    if delta_clean.startswith(prefix_clean):
        return delta_clean
    if prefix_clean.endswith(delta_clean):
        return prefix_clean

    prefix_words = prefix_clean.split()
    delta_words = delta_clean.split()
    if len(prefix_words) > 1 or len(delta_words) > 1:
        max_word_overlap = min(len(prefix_words), len(delta_words), 8)
        for size in range(max_word_overlap, 0, -1):
            if prefix_words[-size:] == delta_words[:size]:
                return _clean_text(
                    ' '.join(prefix_words + delta_words[size:])
                )

    prefix_lower = prefix_clean.lower()
    delta_lower = delta_clean.lower()
    max_char_overlap = min(len(prefix_lower), len(delta_lower), 24)
    for size in range(max_char_overlap, 1, -1):
        if prefix_lower[-size:] == delta_lower[:size]:
            return _clean_text(prefix_clean + delta_clean[size:])

    return _clean_text(f'{prefix_clean} {delta_clean}')


def _transcript_unit_count(text: str) -> int:
    cleaned = _clean_text(text)
    if not cleaned:
        return 0

    words = cleaned.split()
    if len(words) > 1:
        return len(words)

    return len(cleaned)


def _common_prefix_transcript(left: str, right: str) -> str:
    left_clean = _clean_text(left)
    right_clean = _clean_text(right)
    if not left_clean or not right_clean:
        return ''

    if left_clean == right_clean:
        return left_clean

    left_words = left_clean.split()
    right_words = right_clean.split()
    if len(left_words) > 1 or len(right_words) > 1:
        shared_words: list[str] = []
        for left_word, right_word in zip(left_words, right_words):
            if left_word != right_word:
                break
            shared_words.append(left_word)

        return _clean_text(' '.join(shared_words))

    shared_index = 0
    max_shared = min(len(left_clean), len(right_clean))
    while (
        shared_index < max_shared
        and left_clean[shared_index].lower() == right_clean[shared_index].lower()
    ):
        shared_index += 1

    return _clean_text(left_clean[:shared_index])


def _subtract_transcript_prefix(full_text: str, prefix: str) -> str:
    full_clean = _clean_text(full_text)
    prefix_clean = _clean_text(prefix)
    if not full_clean or not prefix_clean:
        return full_clean
    if full_clean == prefix_clean:
        return ''

    full_words = full_clean.split()
    prefix_words = prefix_clean.split()
    if max(len(full_words), len(prefix_words)) > 1:
        prefix_len = len(prefix_words)
        if prefix_len <= len(full_words) and full_words[:prefix_len] == prefix_words:
            return _clean_text(' '.join(full_words[prefix_len:]))

    if full_clean.startswith(prefix_clean):
        return _clean_text(full_clean[len(prefix_clean) :])

    shared_prefix = _common_prefix_transcript(prefix_clean, full_clean)
    if shared_prefix and shared_prefix == prefix_clean:
        return _clean_text(full_clean[len(shared_prefix) :])

    return full_clean


def _estimate_transcript_audio_bytes(
    transcript_fragment: str,
    full_transcript: str,
    full_audio_bytes: int,
) -> int:
    full_bytes = max(0, int(full_audio_bytes or 0))
    if full_bytes <= 0:
        return 0

    fragment_units = _transcript_unit_count(transcript_fragment)
    full_units = _transcript_unit_count(full_transcript)
    if fragment_units <= 0 or full_units <= 0:
        return 0

    ratio = _clip(fragment_units / full_units, 0.0, 1.0)
    estimated = int(full_bytes * ratio)
    return max(0, min(estimated, full_bytes))


def _take_transcript_prefix_by_audio_bytes(
    transcript: str,
    total_audio_bytes: int,
    target_audio_bytes: int,
) -> str:
    transcript_clean = _clean_text(transcript)
    total_bytes = max(0, int(total_audio_bytes or 0))
    target_bytes = max(0, int(target_audio_bytes or 0))
    if not transcript_clean or total_bytes <= 0 or target_bytes <= 0:
        return ''
    if target_bytes >= total_bytes:
        return transcript_clean

    words = transcript_clean.split()
    if len(words) > 1:
        ratio = _clip(target_bytes / total_bytes, 0.0, 1.0)
        word_count = max(1, min(len(words), int(round(len(words) * ratio))))
        return ' '.join(words[:word_count]).strip()

    ratio = _clip(target_bytes / total_bytes, 0.0, 1.0)
    char_count = max(
        1,
        min(len(transcript_clean), int(round(len(transcript_clean) * ratio))),
    )
    return transcript_clean[:char_count].strip()


def _ends_with_sentence_terminal(text: str) -> bool:
    return _clean_text(text).endswith(
        ('。', '！', '？', '.', '!', '?', ';', '；', '…')
    )


def _supports_stop_check_parameter(callback: Callable[..., Any]) -> bool:
    with contextlib.suppress(TypeError, ValueError):
        signature = inspect.signature(callback)
        for parameter in signature.parameters.values():
            if parameter.kind == inspect.Parameter.VAR_KEYWORD:
                return True

        return 'stop_check' in signature.parameters

    return False


def _split_tts_segments(text: str, *, flush: bool = False) -> tuple[list[str], str]:
    buffer = str(text or '')
    if not buffer:
        return [], ''

    sentence_endings = {'。', '！', '？', '!', '?', ';', '；', '\n'}
    soft_breaks = {'，', ',', '、', '：', ':'}
    segments: list[str] = []
    start = 0

    for index, character in enumerate(buffer):
        current = buffer[start : index + 1]
        current_length = len(current.strip())
        if character in sentence_endings:
            segment = current.strip()
            if segment:
                segments.append(segment)
            start = index + 1
            continue

        if character in soft_breaks and current_length >= 24:
            segment = current.strip()
            if segment:
                segments.append(segment)
            start = index + 1
            continue

        if current_length >= TTS_STREAM_HARD_BREAK_CHARS:
            segment = current.strip()
            if segment:
                segments.append(segment)
            start = index + 1

    remainder = buffer[start:]
    if flush:
        segment = remainder.strip()
        if segment:
            segments.append(segment)
        remainder = ''

    return segments, remainder


def _clip(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _build_error_event(message: str) -> dict[str, Any]:
    return {'type': 'voice_error', 'message': message}


def _write_pcm16_wave(path: str, pcm_bytes: bytes, sample_rate: int) -> None:
    with wave.open(path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)


def _decode_json_response(payload: bytes) -> dict[str, Any]:
    return json.loads(payload.decode('utf-8'))


def _extract_http_text_response(payload: bytes, content_type: str) -> str:
    if 'application/json' in content_type:
        data = _decode_json_response(payload)
        candidates = [
            data.get('text'),
            data.get('transcript'),
            data.get('result'),
            (data.get('data') or {}).get('text')
            if isinstance(data.get('data'), dict)
            else None,
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return _clean_text(candidate)
        return ''

    return _clean_text(payload.decode('utf-8', errors='ignore'))


def _extract_http_audio_response(payload: bytes, content_type: str) -> tuple[bytes, str]:
    if 'application/json' in content_type:
        data = _decode_json_response(payload)
        candidates = [
            data.get('audioBase64'),
            data.get('audio_base64'),
            data.get('audio'),
            (data.get('data') or {}).get('audioBase64')
            if isinstance(data.get('data'), dict)
            else None,
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                try:
                    return base64.b64decode(candidate), str(
                        data.get('mimeType')
                        or data.get('mime_type')
                        or 'audio/mpeg'
                    )
                except Exception:
                    continue
        return b'', str(data.get('mimeType') or 'audio/mpeg')

    return payload, (content_type or 'audio/mpeg')


def _http_post_json(
    url: str,
    payload: dict[str, Any],
    timeout_seconds: float = 25.0,
) -> tuple[bytes, str]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return response.read(), response.headers.get_content_type()


def _probe_http_endpoint(
    url: str,
    timeout_seconds: float = 1.5,
) -> tuple[bool, str]:
    try:
        parsed = urllib.parse.urlsplit(url.strip())
    except Exception as error:
        return False, f'Invalid URL: {error}'

    host = parsed.hostname
    port = parsed.port
    if not host:
        return False, 'Missing hostname.'

    if port is None:
        if parsed.scheme in ('https', 'wss'):
            port = 443
        elif parsed.scheme in ('http', 'ws'):
            port = 80
        else:
            return False, f'Unsupported scheme: {parsed.scheme or "unknown"}'

    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            return True, ''
    except OSError as error:
        return False, str(error)


def _normalize_vibevoice_stream_url(url: str) -> str:
    trimmed = str(url or '').strip()
    if not trimmed:
        return ''

    parsed = urllib.parse.urlsplit(trimmed)
    scheme = parsed.scheme.lower()
    if scheme not in ('http', 'https', 'ws', 'wss'):
        raise ValueError(f'Unsupported VibeVoice realtime URL scheme: {parsed.scheme or "unknown"}')

    ws_scheme = 'wss' if scheme in ('https', 'wss') else 'ws'
    path = parsed.path or ''
    if not path or path == '/':
        path = '/stream'

    rebuilt = parsed._replace(scheme=ws_scheme, path=path)
    return urllib.parse.urlunsplit(rebuilt)


def _normalize_vibevoice_config_url(url: str) -> str:
    trimmed = str(url or '').strip()
    if not trimmed:
        return ''

    parsed = urllib.parse.urlsplit(trimmed)
    scheme = parsed.scheme.lower()
    if scheme not in ('http', 'https', 'ws', 'wss'):
        raise ValueError(f'Unsupported VibeVoice realtime URL scheme: {parsed.scheme or "unknown"}')

    http_scheme = 'https' if scheme in ('https', 'wss') else 'http'
    path = parsed.path or ''
    if not path or path == '/':
        path = '/config'
    elif path.endswith('/stream'):
        path = f'{path[: -len("/stream")]}/config' or '/config'
    else:
        path = f'{path.rsplit("/", 1)[0]}/config' if '/' in path else '/config'

    rebuilt = parsed._replace(
        scheme=http_scheme,
        path=path,
        query='',
        fragment='',
    )
    return urllib.parse.urlunsplit(rebuilt)


def _normalize_vibevoice_voice_key(value: str) -> str:
    candidate = str(value or '').strip()
    if not candidate:
        return ''

    if 'Neural' in candidate:
        return ''

    return candidate


def _fetch_vibevoice_runtime_config(
    url: str,
    timeout_seconds: float = 1.5,
) -> dict[str, Any]:
    config_url = _normalize_vibevoice_config_url(url)
    if not config_url:
        return {}

    try:
        request = urllib.request.Request(
            config_url,
            headers={
                'Accept': 'application/json',
            },
        )
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except Exception:
        return {}

    if isinstance(payload, dict):
        return payload

    return {}


def _normalize_voice_emotion_label(raw_label: str) -> str:
    normalized = raw_label.lower().replace('_', ' ').replace('-', ' ')
    if any(token in normalized for token in ('angry', 'anger', 'mad', 'frustrat')):
        return 'angry'
    if any(token in normalized for token in ('sad', 'depress', 'sorrow', 'upset')):
        return 'sad'
    if any(token in normalized for token in ('happy', 'joy', 'pleased', 'positive')):
        return 'happy'
    if any(token in normalized for token in ('excited', 'surpris', 'enthusias')):
        return 'excited'
    if any(token in normalized for token in ('neutral', 'calm', 'relaxed', 'peaceful')):
        return 'calm'
    return 'unknown'


def _describe_voice_emotion(label: str, confidence: float) -> list[str]:
    if label == 'happy':
        return [
            f"The user's vocal emotion sounds happy (confidence {confidence:.2f}).",
            'Match that with light warmth and a little extra energy.',
        ]

    if label == 'excited':
        return [
            f"The user's vocal emotion sounds excited (confidence {confidence:.2f}).",
            'Reply with lively energy, but keep the answer concise and easy to follow.',
        ]

    if label == 'sad':
        return [
            f"The user's vocal emotion sounds sad or low (confidence {confidence:.2f}).",
            'Reply gently, add emotional support, and avoid sounding cold.',
        ]

    if label == 'angry':
        return [
            f"The user's vocal emotion sounds frustrated or angry (confidence {confidence:.2f}).",
            'Stay calm, grounded, and slightly de-escalating.',
        ]

    if label == 'calm':
        return [
            f"The user's vocal emotion sounds calm (confidence {confidence:.2f}).",
            'Keep the tone steady, natural, and relaxed.',
        ]

    return []


def _normalize_wake_word(value: str) -> str:
    normalized = str(value or '').strip()
    if not normalized or normalized == '灏忔':
        return '小桌'

    return normalized


def _is_corrupted_wake_word(value: str) -> bool:
    normalized = str(value or '').strip()
    if not normalized:
        return True

    return any(marker in normalized for marker in CORRUPTED_WAKE_WORD_MARKERS)


def _normalize_text_for_match(value: str) -> str:
    lowered = str(value or '').lower().strip()
    return re.sub(r'[\W_]+', '', lowered, flags=re.UNICODE)


def _build_phrase_match_pattern(value: str) -> re.Pattern[str] | None:
    units = [
        re.escape(character)
        for character in str(value or '').strip()
        if not character.isspace()
    ]
    if not units:
        return None

    separator_pattern = r'[\s,，。.!！？?、:：;；\-]*'
    return re.compile(
        r'^\s*' + separator_pattern.join(units) + separator_pattern,
        re.IGNORECASE,
    )


def _strip_wake_word(transcript: str, wake_word: str) -> str:
    pattern = _build_phrase_match_pattern(wake_word)
    if pattern is None:
        return str(transcript or '').strip()

    match = pattern.match(str(transcript or ''))
    if not match:
        return str(transcript or '').strip()

    return str(transcript[match.end() :]).strip()


def _normalize_wake_word(value: str) -> str:
    normalized = str(value or '').strip()
    if _is_corrupted_wake_word(normalized):
        return DEFAULT_WAKE_WORD

    return normalized


class FasterWhisperTranscriber:
    name = 'faster-whisper'
    available = True
    reason = ''

    def __init__(self) -> None:
        from faster_whisper import WhisperModel  # type: ignore

        self.target = 'small'
        self.model = WhisperModel('small', device='cpu', compute_type='int8')
        self.metadata = {
            'sttMode': 'memory-pcm',
            'partialTranscripts': 'native',
            'finalizationStrategy': 'incremental-tail-merge-v3',
            'partialAnchorStrategy': 'stable-prefix-checkpoints',
            'partialDecodeStrategy': 'incremental-tail-merge-v5-smooth-anchor',
            'partialTranscriptState': 'stable-prefix-unstable-tail',
        }

    def transcribe(self, path: str, language: str = DEFAULT_SPEECH_LANGUAGE) -> str:
        segments, _info = self.model.transcribe(
            path,
            language=language,
            beam_size=1,
            best_of=1,
            condition_on_previous_text=False,
            without_timestamps=True,
            vad_filter=False,
            temperature=0.0,
        )
        return _clean_text(''.join(segment.text for segment in segments))

    def transcribe_pcm(
        self,
        pcm_bytes: bytes,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        language: str = DEFAULT_SPEECH_LANGUAGE,
        *,
        partial: bool = False,
        prefix_hint: str = '',
    ) -> str:
        _ = sample_rate
        import numpy as np  # type: ignore

        audio_array = np.frombuffer(pcm_bytes, dtype=np.int16)
        if audio_array.size == 0:
            return ''

        audio_float32 = audio_array.astype(np.float32) / 32768.0
        options: dict[str, Any] = {
            'language': language,
            'beam_size': 1,
            'best_of': 1,
            'condition_on_previous_text': False,
            'without_timestamps': True,
            'vad_filter': False,
            'temperature': 0.0,
        }
        prompt = _build_partial_transcript_prompt(prefix_hint) if prefix_hint else ''
        if prompt:
            options['initial_prompt'] = prompt

        segments, _info = self.model.transcribe(audio_float32, **options)
        return _clean_text(''.join(segment.text for segment in segments))


class OpenAIWhisperTranscriber:
    name = 'whisper'
    available = True
    reason = ''

    def __init__(self) -> None:
        import whisper  # type: ignore

        self.target = 'base'
        self.model = whisper.load_model('base')

    def transcribe(self, path: str, language: str = DEFAULT_SPEECH_LANGUAGE) -> str:
        result = self.model.transcribe(path, language=language)
        return _clean_text(str(result.get('text', '')))


class HttpAsrTranscriber:
    available = True
    reason = ''

    def __init__(self, url: str, name: str) -> None:
        if not url.strip():
            raise ValueError(f'{name} URL is empty.')

        self.url = url.strip()
        self.name = name
        self.target = self.url

        reachable, reason = _probe_http_endpoint(self.url)
        if not reachable:
            raise ValueError(f'{name} endpoint is unreachable: {reason}')

    def transcribe(self, path: str, language: str = DEFAULT_SPEECH_LANGUAGE) -> str:
        with open(path, 'rb') as audio_file:
            audio_bytes = audio_file.read()

        payload = {
            'audioBase64': base64.b64encode(audio_bytes).decode('ascii'),
            'audio_base64': base64.b64encode(audio_bytes).decode('ascii'),
            'sampleRate': DEFAULT_SAMPLE_RATE,
            'sample_rate': DEFAULT_SAMPLE_RATE,
            'language': language,
            'format': 'wav',
        }
        response_payload, content_type = _http_post_json(self.url, payload)
        return _extract_http_text_response(response_payload, content_type)


class DummyTranscriber:
    name = 'unavailable'
    available = False

    def __init__(self, requested: str, reason: str) -> None:
        self.requested = requested
        self.reason = reason
        self.target = requested

    def transcribe(self, _path: str, language: str = DEFAULT_SPEECH_LANGUAGE) -> str:
        _ = language
        return ''


class EdgeTtsSynthesizer:
    name = 'edge-tts'
    available = True
    reason = ''

    async def synthesize(
        self,
        text: str,
        voice: str = DEFAULT_TTS_VOICE,
        language: str = DEFAULT_SPEECH_LANGUAGE,
    ) -> tuple[bytes, str]:
        _ = language
        import edge_tts  # type: ignore

        self.target = voice
        audio = bytearray()
        communicator = edge_tts.Communicate(text=text, voice=voice)

        async for chunk in communicator.stream():
            if chunk.get('type') == 'audio':
                audio.extend(chunk.get('data', b''))

        return bytes(audio), 'audio/mpeg'


class HttpTtsSynthesizer:
    available = True
    reason = ''

    def __init__(
        self,
        url: str,
        name: str,
        *,
        default_payload: dict[str, Any] | None = None,
    ) -> None:
        if not url.strip():
            raise ValueError(f'{name} URL is empty.')

        self.url = url.strip()
        self.name = name
        self.default_payload = default_payload or {}
        self.target = self.url

        reachable, reason = _probe_http_endpoint(self.url)
        if not reachable:
            raise ValueError(f'{name} endpoint is unreachable: {reason}')

    async def synthesize(
        self,
        text: str,
        voice: str = DEFAULT_TTS_VOICE,
        language: str = DEFAULT_SPEECH_LANGUAGE,
    ) -> tuple[bytes, str]:
        payload = {
            **self.default_payload,
            'text': text,
            'voice': voice,
            'language': language,
            'format': 'mp3',
        }
        response_payload, content_type = await asyncio.to_thread(
            _http_post_json,
            self.url,
            payload,
        )
        return _extract_http_audio_response(response_payload, content_type)


class VibeVoiceRealtimeWebSocketSynthesizer:
    name = 'vibevoice-realtime'
    available = True
    reason = ''

    def __init__(self, url: str) -> None:
        if not url.strip():
            raise ValueError('vibevoice-realtime URL is empty.')

        self.url = _normalize_vibevoice_stream_url(url)
        self.config_url = _normalize_vibevoice_config_url(url)
        self.target = self.url
        self.voice_presets: list[str] = []
        self.default_voice_key = ''
        self.metadata: dict[str, Any] = {}

        reachable, reason = _probe_http_endpoint(self.url)
        if not reachable:
            raise ValueError(f'vibevoice-realtime endpoint is unreachable: {reason}')

        runtime_config = _fetch_vibevoice_runtime_config(url)
        default_voice = str(runtime_config.get('default_voice') or '').strip()
        voices = runtime_config.get('voices')
        if isinstance(voices, list):
            self.voice_presets = [
                str(item).strip()
                for item in voices
                if isinstance(item, str) and str(item).strip()
            ]
        if default_voice:
            self.default_voice_key = default_voice
            if default_voice not in self.voice_presets:
                self.voice_presets.insert(0, default_voice)
        if self.config_url:
            self.metadata['configUrl'] = self.config_url
        if self.default_voice_key:
            self.metadata['defaultVoice'] = self.default_voice_key
        if self.voice_presets:
            self.metadata['voices'] = self.voice_presets[:24]

    async def stream_audio(
        self,
        text: str,
        voice: str = DEFAULT_TTS_VOICE,
        language: str = DEFAULT_SPEECH_LANGUAGE,
        stop_check: Callable[[], bool] | None = None,
    ):
        _ = language
        if not text.strip():
            return

        import websockets

        voice_key = _normalize_vibevoice_voice_key(voice)
        if self.voice_presets:
            if voice_key not in self.voice_presets:
                voice_key = self.default_voice_key
        elif voice_key == DEFAULT_TTS_VOICE:
            voice_key = self.default_voice_key
        params = {
            'text': text,
        }
        if voice_key:
            params['voice'] = voice_key

        stream_url = f'{self.url}?{urllib.parse.urlencode(params)}'
        async with websockets.connect(stream_url, max_size=None) as websocket:
            while True:
                if callable(stop_check) and stop_check():
                    await websocket.close(code=1000, reason='client-interrupt')
                    return

                try:
                    message = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=VIBEVOICE_STREAM_POLL_SECONDS,
                    )
                except asyncio.TimeoutError:
                    continue
                except websockets.ConnectionClosed:
                    break

                if isinstance(message, bytes):
                    if not message:
                        continue

                    yield {
                        'audio_bytes': message,
                        'mime_type': 'audio/pcm',
                        'audio_format': 'pcm16',
                        'sample_rate': 24000,
                    }
                    continue

                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    continue

                if not isinstance(payload, dict):
                    continue

                if payload.get('type') != 'log':
                    continue

                event = str(payload.get('event') or '')
                data = payload.get('data')
                if event == 'backend_error':
                    if isinstance(data, dict):
                        message_text = str(data.get('message') or 'Unknown backend error.')
                    else:
                        message_text = 'Unknown backend error.'
                    raise RuntimeError(message_text)


class DummySynthesizer:
    name = 'unavailable'
    available = False

    def __init__(self, requested: str, reason: str) -> None:
        self.requested = requested
        self.reason = reason
        self.target = requested

    async def synthesize(
        self,
        text: str,
        voice: str = DEFAULT_TTS_VOICE,
        language: str = DEFAULT_SPEECH_LANGUAGE,
    ) -> tuple[bytes, str]:
        _ = text
        _ = voice
        _ = language
        return b'', 'audio/mpeg'


class EnergyVadDetector:
    name = 'energy'
    available = True
    reason = ''

    def __init__(self) -> None:
        self.noise_floor = DEFAULT_ENERGY_THRESHOLD * 0.35
        self.smoothed_rms = 0.0
        self.is_active = False
        self.release_hold_ms = 0.0

    def detect(self, pcm_bytes: bytes, sample_rate: int) -> tuple[bool, float]:
        if not pcm_bytes:
            return False, 0.0

        rms = audioop.rms(pcm_bytes, 2)
        chunk_ms = (len(pcm_bytes) / 2 / max(sample_rate, 1)) * 1000.0
        alpha = 0.32 if self.smoothed_rms > 0 else 1.0
        self.smoothed_rms = (
            (self.smoothed_rms * (1.0 - alpha)) + (float(rms) * alpha)
        )

        base_threshold = max(DEFAULT_ENERGY_THRESHOLD * 0.45, self.noise_floor * 2.1)
        activate_threshold = max(base_threshold, self.noise_floor + 120.0)
        release_threshold = max(DEFAULT_ENERGY_THRESHOLD * 0.3, activate_threshold * 0.72)

        detected = self.smoothed_rms >= activate_threshold
        if detected:
            self.is_active = True
            self.release_hold_ms = max(self.release_hold_ms, 140.0)
        elif self.is_active:
            if self.smoothed_rms >= release_threshold:
                detected = True
                self.release_hold_ms = max(self.release_hold_ms, 80.0)
            elif self.release_hold_ms > 0.0:
                self.release_hold_ms = max(0.0, self.release_hold_ms - chunk_ms)
                detected = True
            else:
                self.is_active = False
        else:
            self.noise_floor = (
                (self.noise_floor * 0.94) + (self.smoothed_rms * 0.06)
            )
            self.noise_floor = _clip(
                self.noise_floor,
                DEFAULT_ENERGY_THRESHOLD * 0.12,
                DEFAULT_ENERGY_THRESHOLD * 1.4,
            )

        if detected:
            self.noise_floor = min(self.noise_floor, self.smoothed_rms)

        confidence = _clip(
            self.smoothed_rms / max(activate_threshold * 1.35, 1.0),
            0.0,
            1.0,
        )
        return detected, confidence


class SileroVadDetector:
    name = 'silero-vad'
    available = True
    reason = ''

    def __init__(self) -> None:
        import numpy as np  # type: ignore
        import torch  # type: ignore
        from silero_vad import get_speech_timestamps, load_silero_vad  # type: ignore

        self.np = np
        self.torch = torch
        self.model = load_silero_vad()
        self.get_speech_timestamps = get_speech_timestamps

    def detect(self, pcm_bytes: bytes, sample_rate: int) -> tuple[bool, float]:
        audio_array = self.np.frombuffer(pcm_bytes, dtype=self.np.int16).astype(self.np.float32)
        if audio_array.size == 0:
            return False, 0.0

        audio_tensor = self.torch.from_numpy(audio_array / 32768.0)
        timestamps = self.get_speech_timestamps(
            audio_tensor,
            self.model,
            sampling_rate=sample_rate,
            threshold=0.42,
            min_speech_duration_ms=48,
            min_silence_duration_ms=72,
        )

        if not timestamps:
            return False, 0.05

        speech_samples = sum(
            int(item.get('end', 0)) - int(item.get('start', 0))
            for item in timestamps
            if isinstance(item, dict)
        )
        confidence = _clip(speech_samples / max(len(audio_array), 1), 0.0, 1.0)
        return True, confidence


class DummyVadDetector:
    name = 'energy-fallback'
    available = True

    def __init__(self, reason: str) -> None:
        self.reason = reason
        self.target = 'energy'
        self.energy = EnergyVadDetector()

    def detect(self, pcm_bytes: bytes, sample_rate: int) -> tuple[bool, float]:
        return self.energy.detect(pcm_bytes, sample_rate)


class DummyVoiceEmotionDetector:
    name = 'none'
    available = False

    def __init__(self, reason: str = '') -> None:
        self.reason = reason
        self.target = ''

    def detect(self, path: str) -> tuple[str, float]:
        _ = path
        return 'unknown', 0.0


class TransformersVoiceEmotionDetector:
    name = 'wav2vec2'
    available = True

    def __init__(self, model_path: str) -> None:
        import numpy as np  # type: ignore
        from transformers import pipeline  # type: ignore
        import torch  # type: ignore

        if not model_path.strip():
            raise ValueError('Voice emotion model path is empty.')

        self.np = np
        self.reason = ''
        self.target = model_path.strip()
        device = 0 if torch.cuda.is_available() else -1
        self.classifier = pipeline(
            task='audio-classification',
            model=model_path.strip(),
            top_k=4,
            device=device,
        )

    def detect(self, path: str) -> tuple[str, float]:
        with wave.open(path, 'rb') as wav_file:
            frames = wav_file.readframes(wav_file.getnframes())
            sample_rate = wav_file.getframerate()

        audio_array = self.np.frombuffer(frames, dtype=self.np.int16).astype(
            self.np.float32
        )
        if audio_array.size == 0:
            return 'unknown', 0.0

        result = self.classifier(
            {
                'raw': audio_array / 32768.0,
                'sampling_rate': sample_rate,
            },
            top_k=4,
        )
        if not isinstance(result, list) or not result:
            return 'unknown', 0.0

        for item in result:
            label = str(item.get('label') or '').strip()
            if not label:
                continue

            normalized = _normalize_voice_emotion_label(label)
            if normalized != 'unknown':
                return normalized, float(item.get('score') or 0.0)

        first = result[0]
        return _normalize_voice_emotion_label(str(first.get('label') or 'unknown')), float(
            first.get('score') or 0.0
        )


def build_transcriber(config: 'VoiceSessionConfig'):
    requested = config.stt_provider
    try:
        if requested == 'faster-whisper':
            return FasterWhisperTranscriber()
        if requested == 'vibevoice-asr':
            return HttpAsrTranscriber(config.vibevoice_asr_url, 'vibevoice-asr')
        return OpenAIWhisperTranscriber()
    except Exception as error:
        return DummyTranscriber(requested, str(error))


def build_synthesizer(config: 'VoiceSessionConfig'):
    requested = config.tts_provider
    try:
        if requested == 'edge-tts':
            return EdgeTtsSynthesizer()
        if requested == 'vibevoice-realtime':
            parsed = urllib.parse.urlsplit(str(config.vibevoice_tts_url or '').strip())
            if parsed.scheme in ('ws', 'wss') or parsed.path in ('', '/', '/stream'):
                return VibeVoiceRealtimeWebSocketSynthesizer(config.vibevoice_tts_url)
            return HttpTtsSynthesizer(
                config.vibevoice_tts_url,
                'vibevoice-realtime',
            )
        if requested == 'gpt-sovits':
            return HttpTtsSynthesizer(
                config.gpt_sovits_url,
                'gpt-sovits',
                default_payload={
                    'refer_wav_path': config.gpt_sovits_reference_audio,
                    'prompt_text': config.gpt_sovits_prompt_text,
                    'prompt_lang': config.gpt_sovits_prompt_language,
                    'prompt_language': config.gpt_sovits_prompt_language,
                    'text_lang': config.speech_language,
                    'text_language': config.speech_language,
                },
            )
    except Exception as error:
        return DummySynthesizer(requested, str(error))

    return DummySynthesizer(requested, f'{requested} is not implemented')


def build_vad_detector(config: 'VoiceSessionConfig'):
    requested = config.vad_provider
    if requested == 'silero-vad':
        try:
            return SileroVadDetector()
        except Exception as error:
            return DummyVadDetector(str(error))

    return EnergyVadDetector()


def build_voice_emotion_detector(config: 'VoiceSessionConfig'):
    if not config.voice_emotion_enabled or config.voice_emotion_provider == 'none':
        return DummyVoiceEmotionDetector('Voice emotion is disabled.')

    try:
        if config.voice_emotion_provider == 'wav2vec2':
            return TransformersVoiceEmotionDetector(config.voice_emotion_model_path)
    except Exception as error:
        return DummyVoiceEmotionDetector(str(error))

    return DummyVoiceEmotionDetector(
        f'{config.voice_emotion_provider} is not implemented.',
    )


@dataclass
class VoiceSessionConfig:
    session_id: str = 'default'
    wake_word_enabled: bool = False
    wake_word: str = DEFAULT_WAKE_WORD
    full_duplex_enabled: bool = False
    allow_interrupt: bool = True
    vad_provider: str = 'silero-vad'
    stt_provider: str = 'faster-whisper'
    tts_provider: str = 'edge-tts'
    speech_language: str = DEFAULT_SPEECH_LANGUAGE
    tts_voice: str = DEFAULT_TTS_VOICE
    voice_emotion_enabled: bool = False
    voice_emotion_provider: str = 'wav2vec2'
    voice_emotion_model_path: str = ''
    vibevoice_asr_url: str = ''
    vibevoice_tts_url: str = ''
    gpt_sovits_url: str = ''
    gpt_sovits_reference_audio: str = ''
    gpt_sovits_prompt_text: str = ''
    gpt_sovits_prompt_language: str = DEFAULT_SPEECH_LANGUAGE
    default_chat_provider: str = 'ollama'
    ollama_url: str = 'http://127.0.0.1:11434'
    ollama_model: str = 'qwen2.5:7b'
    openai_base_url: str = 'https://api.openai.com/v1'
    openai_api_key: str = ''
    openai_model: str = 'gpt-4.1-mini'
    zhipu_base_url: str = 'https://open.bigmodel.cn/api/paas/v4'
    zhipu_api_key: str = ''
    zhipu_model: str = 'glm-4.5-air'
    qwen_local_model_path: str = 'models/qwen.gguf'
    qwen_local_context_size: int = 4096
    qwen_local_threads: int = 4
    qwen_local_gpu_layers: int = 0
    search_enabled: bool = False
    search_provider: str = 'duckduckgo'
    search_max_results: int = 5
    chat_temperature: float = 0.7
    chat_max_tokens: int = 2048


@dataclass
class VoiceSessionState:
    speech_buffer: bytearray = field(default_factory=bytearray)
    partial_decode_buffer: bytearray = field(default_factory=bytearray)
    pre_speech_chunks: deque[bytes] = field(default_factory=deque)
    pre_speech_buffer_ms: float = 0.0
    speech_active: bool = False
    silence_ms: float = 0.0
    active_until: float = 0.0
    is_speaking: bool = False
    processing_active: bool = False
    vad_active: bool = False
    history: list[dict[str, str]] = field(default_factory=list)
    last_voice_emotion_label: str = 'unknown'
    last_voice_emotion_confidence: float = 0.0
    last_voice_emotion_at: float = 0.0
    last_partial_transcript: str = ''
    last_partial_transcript_at: float = 0.0
    last_partial_transcript_audio_ms: float = 0.0
    last_partial_transcript_audio_bytes: int = 0
    stable_partial_transcript: str = ''
    stable_partial_transcript_at: float = 0.0
    stable_partial_transcript_audio_ms: float = 0.0
    stable_partial_transcript_audio_bytes: int = 0
    partial_revision: int = 0
    partial_checkpoints: deque['PartialTranscriptCheckpoint'] = field(
        default_factory=deque
    )
    partial_committed_transcript: str = ''
    partial_committed_audio_ms: float = 0.0
    partial_committed_audio_bytes: int = 0
    active_capture_backend: str = ''


@dataclass
class PartialTranscriptCheckpoint:
    transcript: str = ''
    transcript_at: float = 0.0
    audio_ms: float = 0.0
    audio_bytes: int = 0
    stable_transcript: str = ''
    stable_audio_bytes: int = 0


@dataclass
class PendingVoiceUtterance:
    audio_bytes: bytes
    speech_audio_ms: float = 0.0
    transcript_hint: str = ''
    partial_transcript: str = ''
    partial_transcript_at: float = 0.0
    partial_audio_bytes: int = 0
    stable_partial_transcript: str = ''
    stable_partial_audio_bytes: int = 0
    partial_checkpoints: list[PartialTranscriptCheckpoint] = field(default_factory=list)


class RealtimeVoiceSession:
    def __init__(
        self,
        app_config: dict[str, Any],
        runtime_config: dict[str, Any] | None = None,
        emit_event: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ):
        runtime_config = runtime_config or {}
        self.config = self._build_config(app_config, runtime_config)
        self.state = VoiceSessionState()
        self._emit_event = emit_event
        self._pending_utterances: deque[PendingVoiceUtterance] = deque()
        self._processing_task: asyncio.Task[Any] | None = None
        self._partial_transcript_task: asyncio.Task[Any] | None = None
        self._response_epoch = 0
        self._closed = False
        self.transcriber = build_transcriber(self.config)
        self.synthesizer = build_synthesizer(self.config)
        self.vad_detector = build_vad_detector(self.config)
        self.voice_emotion_detector = build_voice_emotion_detector(self.config)
        self.chat_service = create_chat_service(
            {
                **app_config,
                'chat_provider': self.config.default_chat_provider,
                'ollama_url': self.config.ollama_url,
                'ollama_model': self.config.ollama_model,
                'openai_base_url': self.config.openai_base_url,
                'openai_api_key': self.config.openai_api_key,
                'openai_model': self.config.openai_model,
                'zhipu_base_url': self.config.zhipu_base_url,
                'zhipu_api_key': self.config.zhipu_api_key,
                'zhipu_model': self.config.zhipu_model,
                'qwen_local': {
                    'model_path': self.config.qwen_local_model_path,
                    'n_ctx': self.config.qwen_local_context_size,
                    'n_threads': self.config.qwen_local_threads,
                    'n_gpu_layers': self.config.qwen_local_gpu_layers,
                },
                'search_enabled': self.config.search_enabled,
                'search_provider': self.config.search_provider,
                'search_max_results': self.config.search_max_results,
                'temperature': self.config.chat_temperature,
                'max_tokens': self.config.chat_max_tokens,
            }
        )

    def _build_config(
        self,
        app_config: dict[str, Any],
        runtime_config: dict[str, Any],
    ) -> VoiceSessionConfig:
        provider_config = runtime_config.get('providerConfig', {})
        if not isinstance(provider_config, dict):
            provider_config = {}

        return VoiceSessionConfig(
            session_id=str(runtime_config.get('sessionId') or 'default'),
            wake_word_enabled=bool(runtime_config.get('wakeWordEnabled', False)),
            wake_word=_normalize_wake_word(
                str(runtime_config.get('wakeWord') or DEFAULT_WAKE_WORD)
            ),
            full_duplex_enabled=bool(runtime_config.get('fullDuplexEnabled', False)),
            allow_interrupt=bool(runtime_config.get('allowInterrupt', True)),
            vad_provider=str(runtime_config.get('vadProvider') or 'silero-vad'),
            stt_provider=str(runtime_config.get('sttProvider') or 'faster-whisper'),
            tts_provider=str(runtime_config.get('ttsProvider') or 'edge-tts'),
            speech_language=str(
                runtime_config.get('speechLanguage') or DEFAULT_SPEECH_LANGUAGE
            ),
            tts_voice=str(runtime_config.get('ttsVoice') or DEFAULT_TTS_VOICE),
            voice_emotion_enabled=bool(
                runtime_config.get('voiceEmotionEnabled', False)
            ),
            voice_emotion_provider=str(
                runtime_config.get('voiceEmotionProvider') or 'wav2vec2'
            ),
            voice_emotion_model_path=str(
                runtime_config.get('voiceEmotionModelPath') or ''
            ),
            vibevoice_asr_url=str(runtime_config.get('vibeVoiceAsrUrl') or ''),
            vibevoice_tts_url=str(runtime_config.get('vibeVoiceTtsUrl') or ''),
            gpt_sovits_url=str(runtime_config.get('gptSovitsUrl') or ''),
            gpt_sovits_reference_audio=str(
                runtime_config.get('gptSovitsReferenceAudio') or ''
            ),
            gpt_sovits_prompt_text=str(
                runtime_config.get('gptSovitsPromptText') or ''
            ),
            gpt_sovits_prompt_language=str(
                runtime_config.get('gptSovitsPromptLanguage')
                or DEFAULT_SPEECH_LANGUAGE
            ),
            default_chat_provider=str(
                provider_config.get('provider')
                or runtime_config.get('defaultChatProvider')
                or app_config.get('chat_provider', 'ollama')
            ),
            ollama_url=str(
                provider_config.get('ollamaUrl')
                or runtime_config.get('ollamaUrl')
                or app_config.get('ollama_url', 'http://127.0.0.1:11434')
            ),
            ollama_model=str(
                provider_config.get('ollamaModel')
                or runtime_config.get('ollamaModel')
                or app_config.get('ollama_model', 'qwen2.5:7b')
            ),
            openai_base_url=str(
                provider_config.get('openaiBaseUrl')
                or runtime_config.get('openaiBaseUrl')
                or app_config.get('openai_base_url', 'https://api.openai.com/v1')
            ),
            openai_api_key=str(
                provider_config.get('openaiApiKey')
                or runtime_config.get('openaiApiKey')
                or app_config.get('openai_api_key', '')
            ),
            openai_model=str(
                provider_config.get('openaiModel')
                or runtime_config.get('openaiModel')
                or app_config.get('openai_model', 'gpt-4.1-mini')
            ),
            zhipu_base_url=str(
                provider_config.get('zhipuBaseUrl')
                or runtime_config.get('zhipuBaseUrl')
                or app_config.get('zhipu_base_url', 'https://open.bigmodel.cn/api/paas/v4')
            ),
            zhipu_api_key=str(
                provider_config.get('zhipuApiKey')
                or runtime_config.get('zhipuApiKey')
                or app_config.get('zhipu_api_key', '')
            ),
            zhipu_model=str(
                provider_config.get('zhipuModel')
                or runtime_config.get('zhipuModel')
                or app_config.get('zhipu_model', 'glm-4.5-air')
            ),
            qwen_local_model_path=str(
                provider_config.get('qwenLocalModelPath')
                or runtime_config.get('qwenLocalModelPath')
                or (app_config.get('qwen_local') or {}).get('model_path', 'models/qwen.gguf')
            ),
            qwen_local_context_size=int(
                provider_config.get('qwenLocalContextSize')
                or runtime_config.get('qwenLocalContextSize')
                or (app_config.get('qwen_local') or {}).get('n_ctx', 4096)
            ),
            qwen_local_threads=int(
                provider_config.get('qwenLocalThreads')
                or runtime_config.get('qwenLocalThreads')
                or (app_config.get('qwen_local') or {}).get('n_threads', 4)
            ),
            qwen_local_gpu_layers=int(
                provider_config.get('qwenLocalGpuLayers')
                or runtime_config.get('qwenLocalGpuLayers')
                or (app_config.get('qwen_local') or {}).get('n_gpu_layers', 0)
            ),
            search_enabled=bool(
                provider_config.get('searchEnabled')
                if provider_config.get('searchEnabled') is not None
                else runtime_config.get('searchEnabled')
                if runtime_config.get('searchEnabled') is not None
                else app_config.get('search_enabled', False)
            ),
            search_provider=str(
                provider_config.get('searchProvider')
                or runtime_config.get('searchProvider')
                or app_config.get('search_provider', 'duckduckgo')
            ),
            search_max_results=int(
                provider_config.get('searchMaxResults')
                or runtime_config.get('searchMaxResults')
                or app_config.get('search_max_results', 5)
            ),
            chat_temperature=float(
                provider_config.get('temperature')
                or runtime_config.get('chatTemperature')
                or app_config.get('temperature', 0.7)
            ),
            chat_max_tokens=int(
                provider_config.get('maxTokens')
                or runtime_config.get('chatMaxTokens')
                or app_config.get('max_tokens', 2048)
            ),
        )

    def start(self) -> list[dict[str, Any]]:
        self._closed = False
        provider_diagnostics = {
            'vad': self._build_provider_diagnostic(
                self.vad_detector,
                'vad',
                self.config.vad_provider,
            ),
            'stt': self._build_provider_diagnostic(
                self.transcriber,
                'stt',
                self.config.stt_provider,
            ),
            'tts': self._build_provider_diagnostic(
                self.synthesizer,
                'tts',
                self.config.tts_provider,
            ),
            'voiceEmotion': self._build_provider_diagnostic(
                self.voice_emotion_detector,
                'voiceEmotion',
                self.config.voice_emotion_provider,
            ),
        }
        provider_issues = [
            f"{item['kind']}: {item['reason']}"
            for item in provider_diagnostics.values()
            if (
                not item['available']
                and item['reason']
                and not (
                    item['kind'] == 'voiceEmotion'
                    and not self.config.voice_emotion_enabled
                )
                and item['requested'] != 'none'
            )
        ]

        return [
            {
                'type': 'voice_session_ready',
                'sessionId': self.config.session_id,
                'vadProvider': getattr(self.vad_detector, 'name', self.config.vad_provider),
                'sttProvider': getattr(self.transcriber, 'name', self.config.stt_provider),
                'ttsProvider': getattr(self.synthesizer, 'name', self.config.tts_provider),
                'wakeWordEnabled': self.config.wake_word_enabled,
                'voiceEmotionEnabled': self.config.voice_emotion_enabled,
                'voiceEmotionProvider': getattr(
                    self.voice_emotion_detector,
                    'name',
                    self.config.voice_emotion_provider,
                ),
                'voiceEmotionAvailable': bool(
                    getattr(self.voice_emotion_detector, 'available', False)
                ),
                'providerDiagnostics': provider_diagnostics,
                'providerIssues': provider_issues,
            },
            {'type': 'voice_state', 'state': 'listening'},
        ]

    def stop(self) -> list[dict[str, Any]]:
        self._closed = True
        self._response_epoch += 1
        self._pending_utterances.clear()
        if self._processing_task and not self._processing_task.done():
            self._processing_task.cancel()
        self._processing_task = None
        if self._partial_transcript_task and not self._partial_transcript_task.done():
            self._partial_transcript_task.cancel()
        self._partial_transcript_task = None
        self.state = VoiceSessionState()
        return [
            {'type': 'voice_state', 'state': 'idle'},
            {
                'type': 'voice_vad_state',
                'active': False,
                'provider': getattr(self.vad_detector, 'name', self.config.vad_provider),
                'confidence': 0.0,
            },
        ]

    def finish_playback(self) -> list[dict[str, Any]]:
        self.state.is_speaking = False
        if self.state.processing_active:
            return [{'type': 'voice_state', 'state': 'processing'}]
        return [{'type': 'voice_state', 'state': 'listening'}]

    def handle_capture_overflow(
        self,
        *,
        dropped_chunks: int = 0,
        queued_chunks: int = 0,
    ) -> list[dict[str, Any]]:
        _ = max(0, int(dropped_chunks or 0))
        _ = max(0, int(queued_chunks or 0))
        self._clear_pre_speech_audio()
        if not self.state.speech_active or not self.state.speech_buffer:
            if self._partial_transcript_task and not self._partial_transcript_task.done():
                self._partial_transcript_task.cancel()
            self._partial_transcript_task = None
            self._reset_partial_tracking()
            self.state.silence_ms = 0.0
            return []

        return self._finalize_speech_buffer()

    async def _emit_events_async(self, events: list[dict[str, Any]]) -> None:
        if not self._emit_event:
            return

        for event in events:
            await self._emit_event(event)

    async def _next_chat_stream_chunk(self, iterator) -> str | None:
        chunk = await asyncio.to_thread(next, iterator, None)
        if chunk is None:
            return None

        text = str(chunk)
        if not text:
            return ''

        return text

    async def _emit_tts_audio_event(
        self,
        payload: dict[str, Any],
        response_epoch: int,
    ) -> bool:
        if response_epoch != self._response_epoch or self._closed:
            return False

        audio_bytes = bytes(payload.get('audio_bytes') or b'')
        if not audio_bytes:
            return False

        event = {
            'state': 'speaking',
            'type': 'voice_tts_audio_chunk',
            'mimeType': str(payload.get('mime_type') or 'audio/mpeg'),
            'audioBase64': base64.b64encode(audio_bytes).decode('ascii'),
        }
        audio_format = str(payload.get('audio_format') or '').strip()
        if audio_format:
            event['audioFormat'] = audio_format

        sample_rate = payload.get('sample_rate')
        if isinstance(sample_rate, int) and sample_rate > 0:
            event['sampleRate'] = sample_rate

        self.state.is_speaking = True
        await self._emit_events_async([event])
        return True

    async def _synthesize_segment_audio(
        self,
        segment: str,
        response_epoch: int,
    ) -> bool:
        stream_audio = getattr(self.synthesizer, 'stream_audio', None)
        if callable(stream_audio):
            emitted_audio = False
            stream_kwargs: dict[str, Any] = {
                'voice': self.config.tts_voice,
                'language': self.config.speech_language,
            }
            if _supports_stop_check_parameter(stream_audio):
                stream_kwargs['stop_check'] = (
                    lambda: response_epoch != self._response_epoch or self._closed
                )
            try:
                async for payload in stream_audio(
                    segment,
                    **stream_kwargs,
                ):
                    emitted = await self._emit_tts_audio_event(payload, response_epoch)
                    emitted_audio = emitted_audio or emitted
                    if response_epoch != self._response_epoch or self._closed:
                        return emitted_audio
            except Exception as error:
                await self._emit_events_async(
                    [
                        _build_error_event(
                            f"TTS provider {getattr(self.synthesizer, 'name', self.config.tts_provider)} failed: {error}",
                        )
                    ]
                )
                return emitted_audio

            return emitted_audio

        try:
            audio_bytes, mime_type = await self.synthesizer.synthesize(
                segment,
                voice=self.config.tts_voice,
                language=self.config.speech_language,
            )
        except Exception as error:
            await self._emit_events_async(
                [
                    _build_error_event(
                        f"TTS provider {getattr(self.synthesizer, 'name', self.config.tts_provider)} failed: {error}",
                    )
                ]
            )
            return False

        return await self._emit_tts_audio_event(
            {
                'audio_bytes': audio_bytes,
                'mime_type': mime_type,
            },
            response_epoch,
        )

    async def _stream_tts_segments(
        self,
        segments: list[str],
        response_epoch: int,
    ) -> None:
        emitted_audio = False

        for segment in segments:
            if response_epoch != self._response_epoch or self._closed:
                return

            emitted_audio = await self._synthesize_segment_audio(segment, response_epoch) or emitted_audio

        if emitted_audio and response_epoch == self._response_epoch and not self._closed:
            await self._emit_events_async([{'type': 'voice_tts_audio_end'}])

    async def _consume_tts_segment_queue(
        self,
        segment_queue: asyncio.Queue[str | None],
        response_epoch: int,
    ) -> None:
        emitted_audio = False

        while True:
            segment = await segment_queue.get()
            if segment is None:
                break

            if response_epoch != self._response_epoch or self._closed:
                return

            emitted_audio = await self._synthesize_segment_audio(segment, response_epoch) or emitted_audio

        if emitted_audio and response_epoch == self._response_epoch and not self._closed:
            await self._emit_events_async([{'type': 'voice_tts_audio_end'}])

    def _cancel_response_generation(self, *, keep_processing_flag: bool = True) -> None:
        self._response_epoch += 1
        self._pending_utterances.clear()
        self.state.is_speaking = False
        if self._partial_transcript_task and not self._partial_transcript_task.done():
            self._partial_transcript_task.cancel()
        self._partial_transcript_task = None
        self._reset_partial_tracking()
        if not keep_processing_flag:
            self.state.processing_active = False

    def _supports_native_pcm_transcription(self) -> bool:
        return callable(getattr(self.transcriber, 'transcribe_pcm', None))

    def _supports_native_partial_transcription(self) -> bool:
        if not self._supports_native_pcm_transcription():
            return False

        metadata = getattr(self.transcriber, 'metadata', None)
        if isinstance(metadata, dict):
            return str(metadata.get('partialTranscripts') or '').strip().lower() == 'native'

        return True

    def _update_stable_partial_prefix(
        self,
        transcript: str,
        *,
        audio_ms: float,
        audio_bytes: int,
    ) -> None:
        previous = _clean_text(self.state.last_partial_transcript)
        if not previous:
            return

        stable_candidate = _common_prefix_transcript(previous, transcript)
        if not stable_candidate:
            return

        current_stable = _clean_text(self.state.stable_partial_transcript)
        if current_stable:
            if stable_candidate.startswith(current_stable):
                next_stable = stable_candidate
            else:
                next_stable = current_stable
        else:
            next_stable = stable_candidate

        if not next_stable:
            return

        estimates = [
            estimate
            for estimate in (
                _estimate_transcript_audio_bytes(
                    next_stable,
                    transcript,
                    audio_bytes,
                ),
                _estimate_transcript_audio_bytes(
                    next_stable,
                    previous,
                    self.state.last_partial_transcript_audio_bytes,
                ),
            )
            if estimate > 0
        ]
        estimated_audio_bytes = min(estimates) if estimates else 0

        if next_stable == current_stable:
            self.state.stable_partial_transcript_at = time.time()
            if self.state.stable_partial_transcript_audio_bytes <= 0 and estimated_audio_bytes > 0:
                self.state.stable_partial_transcript_audio_bytes = estimated_audio_bytes
                self.state.stable_partial_transcript_audio_ms = (
                    estimated_audio_bytes / 2 / DEFAULT_SAMPLE_RATE
                ) * 1000.0
            return

        self.state.stable_partial_transcript = next_stable
        self.state.stable_partial_transcript_at = time.time()
        self.state.stable_partial_transcript_audio_bytes = estimated_audio_bytes
        if estimated_audio_bytes > 0:
            self.state.stable_partial_transcript_audio_ms = (
                estimated_audio_bytes / 2 / DEFAULT_SAMPLE_RATE
            ) * 1000.0
        else:
            self.state.stable_partial_transcript_audio_ms = min(
                audio_ms,
                self.state.last_partial_transcript_audio_ms or audio_ms,
            )

    def _has_stable_partial_anchor(self) -> bool:
        if _clean_text(self.state.partial_committed_transcript):
            return True

        stable = _clean_text(self.state.stable_partial_transcript)
        if not stable:
            return False

        if (time.time() - self.state.stable_partial_transcript_at) > PARTIAL_TRANSCRIPT_REUSE_MAX_AGE_SECONDS:
            return False

        return True

    def _get_partial_transcript_parts(
        self,
        transcript: str,
        *,
        audio_bytes: int = 0,
    ) -> tuple[str, str, float]:
        transcript_clean = _clean_text(transcript)
        stable_text = self._combine_partial_transcript(
            self.state.stable_partial_transcript
        )
        unstable_text = _subtract_transcript_prefix(transcript_clean, stable_text)
        stable_audio_bytes = max(
            0,
            int(self.state.partial_committed_audio_bytes or 0)
            + int(self.state.stable_partial_transcript_audio_bytes or 0),
        )
        if audio_bytes > 0:
            stable_audio_bytes = min(
                stable_audio_bytes,
                int(self.state.partial_committed_audio_bytes or 0) + int(audio_bytes),
            )

        if stable_audio_bytes > 0:
            stable_audio_ms = (
                stable_audio_bytes / 2 / DEFAULT_SAMPLE_RATE
            ) * 1000.0
        else:
            stable_audio_ms = float(self.state.stable_partial_transcript_audio_ms or 0.0)

        return stable_text, unstable_text, stable_audio_ms

    def _build_partial_transcript_payload(
        self,
        transcript: str,
        *,
        audio_ms: float,
        stable_text: str,
        unstable_text: str,
        stable_audio_ms: float,
    ) -> dict[str, Any]:
        self.state.partial_revision += 1
        metadata = getattr(self.transcriber, 'metadata', None)
        strategy = ''
        if isinstance(metadata, dict):
            strategy = str(metadata.get('partialDecodeStrategy') or '').strip()

        return {
            'type': 'voice_partial_transcript',
            'text': _clean_text(transcript),
            'stableText': stable_text,
            'unstableText': unstable_text,
            'audioMs': round(float(audio_ms or 0.0), 1),
            'stableAudioMs': round(float(stable_audio_ms or 0.0), 1),
            'revision': self.state.partial_revision,
            'provider': getattr(self.transcriber, 'name', self.config.stt_provider),
            'strategy': strategy,
        }

    def _score_partial_candidate(
        self,
        candidate: str,
        *,
        previous_partial: str,
        stable_partial: str,
        anchor_prefix: str,
    ) -> tuple[int, int, int, int, int, int, int] | None:
        candidate_clean = _clean_text(candidate)
        if not candidate_clean:
            return None

        previous_clean = _clean_text(previous_partial)
        stable_clean = _clean_text(stable_partial)
        anchor_clean = _clean_text(anchor_prefix)
        candidate_units = _transcript_unit_count(candidate_clean)
        stable_units = _transcript_unit_count(stable_clean)
        previous_units = _transcript_unit_count(previous_clean)
        stable_match_units = _transcript_unit_count(
            _common_prefix_transcript(stable_clean, candidate_clean)
        )
        previous_match_units = _transcript_unit_count(
            _common_prefix_transcript(previous_clean, candidate_clean)
        )
        anchor_match_units = _transcript_unit_count(
            _common_prefix_transcript(anchor_clean, candidate_clean)
        )
        unstable_units = _transcript_unit_count(
            _subtract_transcript_prefix(candidate_clean, stable_clean)
        )
        keeps_stable_prefix = int(
            not stable_clean
            or stable_match_units >= max(1, stable_units - 1)
        )
        keeps_anchor_prefix = int(
            not anchor_clean
            or anchor_match_units >= max(1, _transcript_unit_count(anchor_clean) - 1)
        )
        regression_penalty = max(0, previous_units - candidate_units)

        return (
            keeps_stable_prefix,
            keeps_anchor_prefix,
            stable_match_units,
            previous_match_units,
            candidate_units,
            -regression_penalty,
            unstable_units,
        )

    def _select_incremental_partial_candidate(
        self,
        *,
        candidates: list[str],
        previous_partial: str,
        stable_partial: str,
        anchor_prefix: str,
        audio_growth_ms: float,
    ) -> str:
        previous_clean = _clean_text(previous_partial)
        stable_clean = _clean_text(stable_partial)
        deduped_candidates: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            candidate_clean = _clean_text(candidate)
            if not candidate_clean or candidate_clean in seen:
                continue
            seen.add(candidate_clean)
            deduped_candidates.append(candidate_clean)

        if not deduped_candidates:
            return previous_clean or _clean_text(anchor_prefix)

        scored_candidates: list[tuple[tuple[int, int, int, int, int, int, int], str]] = []
        for candidate in deduped_candidates:
            score = self._score_partial_candidate(
                candidate,
                previous_partial=previous_clean,
                stable_partial=stable_clean,
                anchor_prefix=anchor_prefix,
            )
            if score is None:
                continue
            scored_candidates.append((score, candidate))

        if not scored_candidates:
            return previous_clean or _clean_text(anchor_prefix)

        scored_candidates.sort(reverse=True, key=lambda item: item[0])
        selected = scored_candidates[0][1]
        if not previous_clean or selected == previous_clean:
            return selected

        selected_units = _transcript_unit_count(selected)
        previous_units = _transcript_unit_count(previous_clean)
        selected_stable_units = _transcript_unit_count(
            _common_prefix_transcript(stable_clean, selected)
        )
        previous_stable_units = _transcript_unit_count(
            _common_prefix_transcript(stable_clean, previous_clean)
        )

        if (
            selected_units + 1 < previous_units
            and selected_stable_units <= previous_stable_units
            and audio_growth_ms <= 640.0
        ):
            return previous_clean

        return selected

    def _record_partial_checkpoint(
        self,
        transcript: str,
        *,
        transcript_at: float,
        audio_ms: float,
        audio_bytes: int,
    ) -> None:
        transcript_clean = _clean_text(transcript)
        if not transcript_clean:
            return

        stable_transcript = _clean_text(self.state.stable_partial_transcript)
        checkpoint = PartialTranscriptCheckpoint(
            transcript=transcript_clean,
            transcript_at=float(transcript_at or time.time()),
            audio_ms=float(audio_ms or 0.0),
            audio_bytes=max(0, int(audio_bytes or 0)),
            stable_transcript=stable_transcript,
            stable_audio_bytes=max(0, int(self.state.stable_partial_transcript_audio_bytes or 0)),
        )
        checkpoints = self.state.partial_checkpoints
        if checkpoints:
            last_checkpoint = checkpoints[-1]
            if (
                last_checkpoint.transcript == checkpoint.transcript
                and last_checkpoint.stable_transcript == checkpoint.stable_transcript
            ):
                checkpoints[-1] = checkpoint
            else:
                checkpoints.append(checkpoint)
        else:
            checkpoints.append(checkpoint)

        while len(checkpoints) > PARTIAL_TRANSCRIPT_CHECKPOINT_LIMIT:
            checkpoints.popleft()

    def _combine_partial_transcript(self, transcript: str) -> str:
        return _merge_incremental_transcript(
            self.state.partial_committed_transcript,
            transcript,
        )

    def _combine_partial_audio_bytes(self, audio_bytes: int) -> int:
        return max(0, int(self.state.partial_committed_audio_bytes or 0)) + max(
            0,
            int(audio_bytes or 0),
        )

    def _combine_partial_audio_ms(self, audio_ms: float) -> float:
        return max(0.0, float(self.state.partial_committed_audio_ms or 0.0)) + max(
            0.0,
            float(audio_ms or 0.0),
        )

    def _get_combined_partial_checkpoints(self) -> list[PartialTranscriptCheckpoint]:
        committed_transcript = _clean_text(self.state.partial_committed_transcript)
        committed_audio_bytes = max(0, int(self.state.partial_committed_audio_bytes or 0))
        committed_audio_ms = max(0.0, float(self.state.partial_committed_audio_ms or 0.0))
        combined: list[PartialTranscriptCheckpoint] = []

        if committed_transcript:
            combined.append(
                PartialTranscriptCheckpoint(
                    transcript=committed_transcript,
                    transcript_at=time.time(),
                    audio_ms=committed_audio_ms,
                    audio_bytes=committed_audio_bytes,
                    stable_transcript=committed_transcript,
                    stable_audio_bytes=committed_audio_bytes,
                )
            )

        for checkpoint in self.state.partial_checkpoints:
            combined.append(
                PartialTranscriptCheckpoint(
                    transcript=self._combine_partial_transcript(checkpoint.transcript),
                    transcript_at=checkpoint.transcript_at,
                    audio_ms=self._combine_partial_audio_ms(checkpoint.audio_ms),
                    audio_bytes=self._combine_partial_audio_bytes(checkpoint.audio_bytes),
                    stable_transcript=self._combine_partial_transcript(
                        checkpoint.stable_transcript
                    ),
                    stable_audio_bytes=self._combine_partial_audio_bytes(
                        checkpoint.stable_audio_bytes
                    ),
                )
            )

        return combined

    def _maybe_compact_partial_decode_buffer(self) -> None:
        stable_transcript = _clean_text(self.state.stable_partial_transcript)
        if not stable_transcript:
            return

        buffer_len = len(self.state.partial_decode_buffer)
        if buffer_len <= 0:
            return

        buffer_audio_ms = (buffer_len / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
        if buffer_audio_ms < CONTINUOUS_ASR_COMPACT_MIN_AUDIO_MS:
            return

        stable_audio_bytes = max(
            0,
            min(buffer_len, int(self.state.stable_partial_transcript_audio_bytes or 0)),
        )
        if stable_audio_bytes <= 0:
            return

        keep_tail_bytes = int(
            DEFAULT_SAMPLE_RATE * 2 * (CONTINUOUS_ASR_COMPACT_KEEP_TAIL_MS / 1000.0)
        )
        min_commit_bytes = int(
            DEFAULT_SAMPLE_RATE
            * 2
            * (CONTINUOUS_ASR_COMPACT_MIN_COMMIT_AUDIO_MS / 1000.0)
        )
        trim_bytes = stable_audio_bytes - keep_tail_bytes
        if trim_bytes < min_commit_bytes:
            return

        committed_prefix = _clean_text(
            _take_transcript_prefix_by_audio_bytes(
                stable_transcript,
                stable_audio_bytes,
                trim_bytes,
            )
        )
        if not committed_prefix:
            return

        del self.state.partial_decode_buffer[:trim_bytes]
        self.state.partial_committed_transcript = _merge_incremental_transcript(
            self.state.partial_committed_transcript,
            committed_prefix,
        )
        self.state.partial_committed_audio_bytes = self._combine_partial_audio_bytes(
            trim_bytes
        )
        self.state.partial_committed_audio_ms = (
            self.state.partial_committed_audio_bytes / 2 / DEFAULT_SAMPLE_RATE
        ) * 1000.0

        self.state.last_partial_transcript = _subtract_transcript_prefix(
            self.state.last_partial_transcript,
            committed_prefix,
        )
        self.state.last_partial_transcript_audio_bytes = max(
            0,
            int(self.state.last_partial_transcript_audio_bytes or 0) - trim_bytes,
        )
        self.state.last_partial_transcript_audio_ms = (
            self.state.last_partial_transcript_audio_bytes / 2 / DEFAULT_SAMPLE_RATE
        ) * 1000.0
        if not self.state.last_partial_transcript:
            self.state.last_partial_transcript_at = 0.0

        self.state.stable_partial_transcript = _subtract_transcript_prefix(
            self.state.stable_partial_transcript,
            committed_prefix,
        )
        self.state.stable_partial_transcript_audio_bytes = max(
            0,
            int(self.state.stable_partial_transcript_audio_bytes or 0) - trim_bytes,
        )
        self.state.stable_partial_transcript_audio_ms = (
            self.state.stable_partial_transcript_audio_bytes / 2 / DEFAULT_SAMPLE_RATE
        ) * 1000.0
        if not self.state.stable_partial_transcript:
            self.state.stable_partial_transcript_at = 0.0

        self.state.partial_checkpoints.clear()

    def _reset_partial_tracking(self) -> None:
        self.state.last_partial_transcript = ''
        self.state.last_partial_transcript_at = 0.0
        self.state.last_partial_transcript_audio_ms = 0.0
        self.state.last_partial_transcript_audio_bytes = 0
        self.state.stable_partial_transcript = ''
        self.state.stable_partial_transcript_at = 0.0
        self.state.stable_partial_transcript_audio_ms = 0.0
        self.state.stable_partial_transcript_audio_bytes = 0
        self.state.partial_revision = 0
        self.state.partial_checkpoints.clear()
        self.state.partial_committed_transcript = ''
        self.state.partial_committed_audio_ms = 0.0
        self.state.partial_committed_audio_bytes = 0
        self.state.partial_decode_buffer.clear()

    def _should_schedule_followup_partial(
        self,
        snapshot_audio_bytes: int,
        response_epoch: int,
    ) -> bool:
        if self._closed or response_epoch != self._response_epoch:
            return False
        if not self.state.speech_active:
            return False

        live_audio_bytes = len(self.state.partial_decode_buffer)
        if live_audio_bytes <= snapshot_audio_bytes:
            return False

        min_followup_bytes = int(
            DEFAULT_SAMPLE_RATE
            * 2
            * (self._get_partial_transcript_force_delta_ms() / 1000.0)
        )
        return (live_audio_bytes - snapshot_audio_bytes) >= max(min_followup_bytes, 1)

    def _schedule_partial_transcript(self, *, force: bool = False) -> None:
        if self._closed:
            return

        if self._partial_transcript_task and not self._partial_transcript_task.done():
            return

        audio_ms = (len(self.state.partial_decode_buffer) / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
        if audio_ms < self._get_partial_transcript_min_audio_ms():
            return

        now = time.time()
        if not force:
            if (now - self.state.last_partial_transcript_at) < self._get_partial_transcript_interval_seconds():
                return
        elif (
            self.state.last_partial_transcript
            and audio_ms
            <= (
                self.state.last_partial_transcript_audio_ms
                + self._get_partial_transcript_force_delta_ms()
            )
        ):
            return

        response_epoch = self._response_epoch
        audio_snapshot = bytes(self.state.partial_decode_buffer)
        self._partial_transcript_task = asyncio.create_task(
            self._emit_partial_transcript(audio_snapshot, response_epoch)
        )

    async def _emit_partial_transcript(
        self,
        pcm_bytes: bytes,
        response_epoch: int,
    ) -> None:
        current_task = asyncio.current_task()
        snapshot_audio_bytes = len(pcm_bytes)
        try:
            try:
                transcript = await self._transcribe_incremental_partial(
                    pcm_bytes,
                )
            except asyncio.CancelledError:
                return
            except Exception:
                return

            if not transcript or self._closed or response_epoch != self._response_epoch:
                return

            transcript = _clean_text(transcript)
            audio_ms = (snapshot_audio_bytes / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
            previous_text = self._combine_partial_transcript(
                self.state.last_partial_transcript
            )
            previous_stable = self._combine_partial_transcript(
                self.state.stable_partial_transcript
            )
            previous_unstable = _subtract_transcript_prefix(
                previous_text,
                previous_stable,
            )

            self._update_stable_partial_prefix(
                transcript,
                audio_ms=audio_ms,
                audio_bytes=snapshot_audio_bytes,
            )
            self.state.last_partial_transcript = transcript
            self.state.last_partial_transcript_at = time.time()
            self.state.last_partial_transcript_audio_ms = audio_ms
            self.state.last_partial_transcript_audio_bytes = snapshot_audio_bytes
            self._maybe_compact_partial_decode_buffer()
            self._record_partial_checkpoint(
                self.state.last_partial_transcript,
                transcript_at=self.state.last_partial_transcript_at,
                audio_ms=self.state.last_partial_transcript_audio_ms,
                audio_bytes=self.state.last_partial_transcript_audio_bytes,
            )

            full_transcript = self._combine_partial_transcript(
                self.state.last_partial_transcript
            )
            total_audio_ms = self._combine_partial_audio_ms(
                self.state.last_partial_transcript_audio_ms
            )
            stable_text, unstable_text, stable_audio_ms = self._get_partial_transcript_parts(
                full_transcript,
                audio_bytes=self.state.last_partial_transcript_audio_bytes,
            )
            if (
                full_transcript == previous_text
                and stable_text == previous_stable
                and unstable_text == previous_unstable
            ):
                return

            await self._emit_events_async(
                [
                    self._build_partial_transcript_payload(
                        full_transcript,
                        audio_ms=total_audio_ms,
                        stable_text=stable_text,
                        unstable_text=unstable_text,
                        stable_audio_ms=stable_audio_ms,
                    )
                ]
            )
        finally:
            if current_task is not None and self._partial_transcript_task is current_task:
                self._partial_transcript_task = None
            if self._should_schedule_followup_partial(
                snapshot_audio_bytes,
                response_epoch,
            ):
                self._schedule_partial_transcript(force=True)

    def _queue_utterance(
        self,
        utterance: bytes,
        *,
        speech_audio_ms: float = 0.0,
        transcript_hint: str = '',
        partial_transcript: str = '',
        partial_transcript_at: float = 0.0,
        partial_audio_bytes: int = 0,
        stable_partial_transcript: str = '',
        stable_partial_audio_bytes: int = 0,
        partial_checkpoints: list[PartialTranscriptCheckpoint] | None = None,
    ) -> list[dict[str, Any]]:
        self._pending_utterances.append(
            PendingVoiceUtterance(
                audio_bytes=utterance,
                speech_audio_ms=max(0.0, float(speech_audio_ms or 0.0)),
                transcript_hint=_clean_text(transcript_hint),
                partial_transcript=_clean_text(partial_transcript),
                partial_transcript_at=float(partial_transcript_at or 0.0),
                partial_audio_bytes=max(0, int(partial_audio_bytes or 0)),
                stable_partial_transcript=_clean_text(stable_partial_transcript),
                stable_partial_audio_bytes=max(0, int(stable_partial_audio_bytes or 0)),
                partial_checkpoints=list(partial_checkpoints or []),
            )
        )
        self.state.processing_active = True

        if self._processing_task is None or self._processing_task.done():
            self._processing_task = asyncio.create_task(self._process_pending_utterances())

        return [{'type': 'voice_state', 'state': 'processing'}]

    async def _process_pending_utterances(self) -> None:
        try:
            while self._pending_utterances and not self._closed:
                utterance = self._pending_utterances.popleft()
                response_epoch = self._response_epoch
                events = await self._process_utterance(
                    utterance.audio_bytes,
                    response_epoch,
                    speech_audio_ms=utterance.speech_audio_ms,
                    transcript_hint=utterance.transcript_hint,
                    partial_transcript=utterance.partial_transcript,
                    partial_transcript_at=utterance.partial_transcript_at,
                    partial_audio_bytes=utterance.partial_audio_bytes,
                    stable_partial_transcript=utterance.stable_partial_transcript,
                    stable_partial_audio_bytes=utterance.stable_partial_audio_bytes,
                    partial_checkpoints=utterance.partial_checkpoints,
                )
                await self._emit_events_async(events)
        except asyncio.CancelledError:
            return
        except Exception as error:
            await self._emit_events_async(
                [
                    _build_error_event(f'Voice pipeline failed: {error}'),
                    {'type': 'voice_state', 'state': 'listening'},
                ]
            )
        finally:
            self.state.processing_active = False
            self._processing_task = None
            if not self.state.is_speaking and not self._closed:
                await self._emit_events_async([{'type': 'voice_state', 'state': 'listening'}])

    async def _process_utterance(
        self,
        utterance: bytes,
        response_epoch: int,
        *,
        speech_audio_ms: float = 0.0,
        transcript_hint: str = '',
        partial_transcript: str = '',
        partial_transcript_at: float = 0.0,
        partial_audio_bytes: int = 0,
        stable_partial_transcript: str = '',
        stable_partial_audio_bytes: int = 0,
        partial_checkpoints: list[PartialTranscriptCheckpoint] | None = None,
    ) -> list[dict[str, Any]]:
        early_events: list[dict[str, Any]] = []
        voice_emotion: dict[str, Any] | None = None
        final_audio_ms = max(
            0.0,
            float(speech_audio_ms or 0.0),
        )
        if final_audio_ms <= 0.0:
            final_audio_ms = (len(utterance) / 2 / DEFAULT_SAMPLE_RATE) * 1000.0

        if transcript_hint:
            transcript = _clean_text(transcript_hint)
            refined_transcript = await self._transcribe_incremental_final(
                utterance,
                partial_transcript=partial_transcript,
                partial_transcript_at=partial_transcript_at,
                partial_audio_bytes=partial_audio_bytes,
                stable_partial_transcript=stable_partial_transcript,
                stable_partial_audio_bytes=stable_partial_audio_bytes,
                partial_checkpoints=partial_checkpoints,
            )
            if refined_transcript:
                transcript = refined_transcript
            voice_emotion = await self._detect_voice_emotion(utterance)
        else:
            transcript = await self._transcribe_incremental_final(
                utterance,
                partial_transcript=partial_transcript,
                partial_transcript_at=partial_transcript_at,
                partial_audio_bytes=partial_audio_bytes,
                stable_partial_transcript=stable_partial_transcript,
                stable_partial_audio_bytes=stable_partial_audio_bytes,
                partial_checkpoints=partial_checkpoints,
            )
            if transcript:
                voice_emotion = await self._detect_voice_emotion(utterance)
            else:
                transcript, voice_emotion = await self._transcribe_and_detect(utterance)
        if response_epoch != self._response_epoch or self._closed:
            return []

        if voice_emotion:
            self.state.last_voice_emotion_label = str(voice_emotion['label'])
            self.state.last_voice_emotion_confidence = float(
                voice_emotion['confidence']
            )
            self.state.last_voice_emotion_at = time.time()
            early_events.append(
                {
                    'type': 'voice_emotion_state',
                    'emotion': voice_emotion['label'],
                    'confidence': voice_emotion['confidence'],
                    'provider': getattr(
                        self.voice_emotion_detector,
                        'name',
                        self.config.voice_emotion_provider,
                    ),
                }
            )

            if not transcript:
                if early_events:
                    await self._emit_events_async(early_events)
                return []

        early_events.append(
            {
                'type': 'voice_final_transcript',
                'text': transcript,
                'stableText': transcript,
                'unstableText': '',
                'audioMs': round(final_audio_ms, 1),
                'stableAudioMs': round(final_audio_ms, 1),
                'provider': getattr(
                    self.transcriber,
                    'name',
                    self.config.stt_provider,
                ),
                'strategy': 'endpointed-final'
                if transcript_hint
                else 'final-transcribe',
            }
        )
        activated, cleaned = self._resolve_activation(transcript)
        if not activated:
            await self._emit_events_async(early_events)
            return []

        if cleaned != transcript:
            early_events.append({'type': 'voice_wake_word_detected', 'text': transcript})

        if self.config.wake_word_enabled and not cleaned.strip():
            self.state.active_until = time.time() + DEFAULT_WAKE_TIMEOUT_SECONDS
            await self._emit_events_async(early_events)
            return []

        prompt_text = cleaned or transcript
        self.state.active_until = time.time() + DEFAULT_WAKE_TIMEOUT_SECONDS
        await self._emit_events_async(early_events)

        prompt = self._build_prompt(prompt_text)
        assistant_chunks: list[str] = []
        segment_buffer = ''
        stream_error: Exception | None = None
        segment_queue: asyncio.Queue[str | None] = asyncio.Queue()
        tts_consumer_task = asyncio.create_task(
            self._consume_tts_segment_queue(segment_queue, response_epoch)
        )

        try:
            stream_iterator = iter(
                self.chat_service.generate_stream(
                    prompt,
                    metadata={'userText': prompt_text},
                )
            )
        except Exception as error:
            await segment_queue.put(None)
            with contextlib.suppress(asyncio.CancelledError):
                await tts_consumer_task
            return [_build_error_event(f'Chat generation failed: {error}')]

        try:
            while True:
                chunk = await self._next_chat_stream_chunk(stream_iterator)
                if chunk is None:
                    break

                if response_epoch != self._response_epoch or self._closed:
                    return []

                if not chunk:
                    continue

                assistant_chunks.append(chunk)
                await self._emit_events_async(
                    [{'type': 'voice_assistant_text_chunk', 'text': chunk}]
                )

                segment_buffer += chunk
                segments, segment_buffer = _split_tts_segments(segment_buffer)
                for segment in segments:
                    await segment_queue.put(segment)
        except Exception as error:
            stream_error = error
        finally:
            if response_epoch == self._response_epoch and not self._closed:
                segments, _ = _split_tts_segments(segment_buffer, flush=True)
                for segment in segments:
                    await segment_queue.put(segment)
            await segment_queue.put(None)
            with contextlib.suppress(asyncio.CancelledError):
                await tts_consumer_task

        if response_epoch != self._response_epoch or self._closed:
            return []

        assistant_text = _clean_text(''.join(assistant_chunks))
        if assistant_text:
            self.state.history.extend(
                [
                    {'role': 'user', 'content': prompt_text},
                    {'role': 'assistant', 'content': assistant_text},
                ]
            )
            self.state.history = self.state.history[-8:]
            await self._emit_events_async(
                [{'type': 'voice_assistant_text', 'text': assistant_text}]
            )

        if stream_error:
            return [_build_error_event(f'Chat generation failed: {stream_error}')]

        return []

    async def process_audio_chunk(
        self,
        pcm_base64: str,
        sample_rate: int,
        channels: int = 1,
        capture_backend: str = '',
    ) -> list[dict[str, Any]]:
        try:
            pcm_bytes = base64.b64decode(pcm_base64)
        except Exception:
            return [_build_error_event('Invalid audio payload.')]

        normalized = self._normalize_audio(pcm_bytes, sample_rate, channels)
        if not normalized:
            return []

        if capture_backend.strip():
            self.state.active_capture_backend = capture_backend.strip()

        chunk_ms = (len(normalized) / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
        is_speech, vad_confidence = self.vad_detector.detect(
            normalized,
            DEFAULT_SAMPLE_RATE,
        )
        events: list[dict[str, Any]] = []

        if self.state.vad_active != is_speech:
            self.state.vad_active = is_speech
            events.append(
                {
                    'type': 'voice_vad_state',
                    'active': is_speech,
                    'provider': getattr(self.vad_detector, 'name', self.config.vad_provider),
                    'confidence': round(vad_confidence, 4),
                }
            )

        if is_speech:
            if self.config.allow_interrupt and (
                self.state.is_speaking or self.state.processing_active
            ):
                should_interrupt_playback = self.state.is_speaking
                self._cancel_response_generation()
                if should_interrupt_playback:
                    events.append({'type': 'voice_interrupt_playback'})

            if not self.state.speech_active:
                prefix = self._consume_pre_speech_audio()
                if prefix:
                    self.state.speech_buffer.extend(prefix)
                    self.state.partial_decode_buffer.extend(prefix)

            self.state.speech_active = True
            self.state.silence_ms = 0.0
            self.state.speech_buffer.extend(normalized)
            self.state.partial_decode_buffer.extend(normalized)
            self._schedule_partial_transcript()
            return events

        if not self.state.speech_active:
            self._remember_pre_speech_chunk(normalized, chunk_ms)
            return events

        self.state.speech_buffer.extend(normalized)
        self.state.partial_decode_buffer.extend(normalized)
        self.state.silence_ms += chunk_ms
        self._schedule_partial_transcript(force=True)

        speech_audio_ms = max(
            0.0,
            (len(self.state.speech_buffer) / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
            - self.state.silence_ms,
        )
        endpoint_hint = self._get_endpoint_transcript_hint(speech_audio_ms)
        if endpoint_hint:
            events.extend(
                self._finalize_speech_buffer(
                    transcript_hint_override=endpoint_hint,
                )
            )
            return events

        if self._should_early_commit_utterance(speech_audio_ms):
            transcript_hint = self._get_reusable_partial_transcript(speech_audio_ms)
            events.extend(
                self._finalize_speech_buffer(
                    transcript_hint_override=transcript_hint,
                )
            )
            return events

        if self.state.silence_ms < self._get_silence_threshold_ms():
            return events

        events.extend(self._finalize_speech_buffer())
        return events

    def _build_provider_diagnostic(
        self,
        provider: Any,
        category: str,
        requested: str,
    ) -> dict[str, Any]:
        resolved = str(getattr(provider, 'name', requested) or requested)
        available = bool(getattr(provider, 'available', True))
        reason = str(getattr(provider, 'reason', '') or '')
        target = str(getattr(provider, 'target', '') or '')
        metadata = getattr(provider, 'metadata', None)

        if not reason and not available:
            reason = f'{resolved} is unavailable.'

        diagnostic = {
            'kind': category,
            'requested': requested,
            'resolved': resolved,
            'available': available,
            'reason': reason,
            'target': target,
        }
        if isinstance(metadata, dict) and metadata:
            diagnostic['metadata'] = metadata

        return diagnostic

    def _resolve_activation(self, transcript: str) -> tuple[bool, str]:
        if not self.config.wake_word_enabled:
            return True, transcript

        wake_word = _normalize_wake_word(self.config.wake_word)
        normalized = _normalize_text_for_match(transcript)
        normalized_wake_word = _normalize_text_for_match(wake_word)

        if normalized_wake_word and normalized_wake_word in normalized:
            cleaned = _strip_wake_word(transcript, wake_word)
            return True, cleaned

        if self.state.active_until > time.time():
            return True, transcript

        return False, ''

    def _build_prompt(self, user_text: str) -> str:
        history_lines = []
        for item in self.state.history[-6:]:
            history_lines.append(f"{item['role'].title()}: {item['content']}")

        voice_emotion_lines: list[str] = []
        if (
            self.config.voice_emotion_enabled
            and self.state.last_voice_emotion_label != 'unknown'
            and self.state.last_voice_emotion_confidence >= 0.35
            and (time.time() - self.state.last_voice_emotion_at) <= 90.0
        ):
            voice_emotion_lines = _describe_voice_emotion(
                self.state.last_voice_emotion_label,
                self.state.last_voice_emotion_confidence,
            )

        return '\n'.join(
            [
                'You are a local-first desktop AI companion speaking with the user in realtime.',
                'Reply in the user language and prefer Simplified Chinese unless the user clearly switches languages.',
                'Sound natural, warm, and alive, like a companion who is already present on the desktop.',
                'Keep responses concise for speech, but not flat: carry emotion, initiative, and a sense of dialogue.',
                'When the user sounds emotional, acknowledge it and gently adapt your tone.',
                'When context is incomplete, ask one short follow-up instead of guessing.',
                'Do not mention prompts, models, providers, hidden rules, or internal memory systems.',
                *voice_emotion_lines,
                *history_lines,
                f'User: {user_text}',
                'Assistant:',
            ]
        )

    def _use_low_latency_thresholds(self) -> bool:
        if self.config.full_duplex_enabled:
            return True

        backend = self.state.active_capture_backend.lower().strip()
        return backend.startswith('rust') or backend == 'audio-worklet'

    def _get_silence_threshold_ms(self) -> float:
        if self._use_low_latency_thresholds():
            return LOW_LATENCY_SILENCE_MS
        return DEFAULT_SILENCE_MS

    def _get_min_speech_ms(self) -> float:
        if self._use_low_latency_thresholds():
            return LOW_LATENCY_MIN_SPEECH_MS
        return DEFAULT_MIN_SPEECH_MS

    def _get_partial_transcript_min_audio_ms(self) -> float:
        if self._supports_native_partial_transcription():
            return STREAMING_PARTIAL_TRANSCRIPT_MIN_AUDIO_MS
        if self._use_low_latency_thresholds():
            return LOW_LATENCY_PARTIAL_TRANSCRIPT_MIN_AUDIO_MS
        return PARTIAL_TRANSCRIPT_MIN_AUDIO_MS

    def _get_partial_transcript_interval_seconds(self) -> float:
        if self._supports_native_partial_transcription():
            return STREAMING_PARTIAL_TRANSCRIPT_INTERVAL_SECONDS
        if self._use_low_latency_thresholds():
            return LOW_LATENCY_PARTIAL_TRANSCRIPT_INTERVAL_SECONDS
        return PARTIAL_TRANSCRIPT_INTERVAL_SECONDS

    def _get_partial_transcript_force_delta_ms(self) -> float:
        if self._supports_native_partial_transcription():
            return STREAMING_PARTIAL_TRANSCRIPT_FORCE_DELTA_MS
        return PARTIAL_TRANSCRIPT_FORCE_DELTA_MS

    def _get_early_commit_silence_ms(self) -> float:
        if self._use_low_latency_thresholds():
            return LOW_LATENCY_EARLY_COMMIT_SILENCE_MS
        return self._get_silence_threshold_ms()

    def _get_reusable_partial_transcript(self, speech_audio_ms: float) -> str:
        transcript = self._combine_partial_transcript(self.state.last_partial_transcript)
        if not transcript:
            return ''

        if (time.time() - self.state.last_partial_transcript_at) > PARTIAL_TRANSCRIPT_REUSE_MAX_AGE_SECONDS:
            return ''

        audio_delta_ms = max(
            0.0,
            speech_audio_ms
            - self._combine_partial_audio_ms(self.state.last_partial_transcript_audio_ms),
        )
        if audio_delta_ms > PARTIAL_TRANSCRIPT_REUSE_MAX_AUDIO_DELTA_MS:
            return ''

        return transcript

    def _get_endpoint_transcript_hint(self, speech_audio_ms: float) -> str:
        if not self._use_low_latency_thresholds():
            return ''

        stable_text = self._combine_partial_transcript(self.state.stable_partial_transcript)
        if not stable_text:
            return ''

        now = time.time()
        if (now - self.state.stable_partial_transcript_at) < ENDPOINT_STABLE_HOLD_SECONDS:
            return ''
        if (now - self.state.last_partial_transcript_at) < ENDPOINT_PARTIAL_IDLE_SECONDS:
            return ''

        stable_audio_ms = self._combine_partial_audio_ms(
            self.state.stable_partial_transcript_audio_ms
        )
        stable_unit_count = _transcript_unit_count(stable_text)
        min_required_audio_ms = ENDPOINT_MIN_STABLE_AUDIO_MS
        if _ends_with_sentence_terminal(stable_text):
            min_required_audio_ms = min(min_required_audio_ms, 560.0)
        elif stable_unit_count >= 8:
            min_required_audio_ms = min(min_required_audio_ms, 640.0)

        if stable_audio_ms < min_required_audio_ms:
            return ''

        required_silence_ms = (
            ENDPOINT_PUNCTUATION_SILENCE_MS
            if _ends_with_sentence_terminal(stable_text)
            else 90.0 if stable_unit_count >= 8 else ENDPOINT_SHORT_SILENCE_MS
        )
        if self.state.silence_ms < required_silence_ms:
            return ''

        full_partial = self._combine_partial_transcript(self.state.last_partial_transcript)
        unstable_tail = _subtract_transcript_prefix(full_partial, stable_text)
        if _transcript_unit_count(unstable_tail) > ENDPOINT_MAX_UNSTABLE_UNITS:
            return ''

        if speech_audio_ms < stable_audio_ms:
            return ''

        return full_partial or stable_text

    def _should_early_commit_utterance(self, speech_audio_ms: float) -> bool:
        if not self._use_low_latency_thresholds():
            return False

        if self.state.silence_ms < self._get_early_commit_silence_ms():
            return False

        min_required_ms = max(
            LOW_LATENCY_EARLY_COMMIT_MIN_SPEECH_MS,
            self._get_partial_transcript_min_audio_ms(),
        )
        if speech_audio_ms < min_required_ms:
            return False

        if not self._has_stable_partial_anchor():
            return False

        return bool(self._get_reusable_partial_transcript(speech_audio_ms))

    def _finalize_speech_buffer(
        self,
        *,
        transcript_hint_override: str = '',
    ) -> list[dict[str, Any]]:
        utterance = bytes(self.state.speech_buffer)
        speech_audio_ms = max(
            0.0,
            (len(utterance) / 2 / DEFAULT_SAMPLE_RATE) * 1000.0 - self.state.silence_ms,
        )
        transcript_hint = _clean_text(transcript_hint_override) or self._get_reusable_partial_transcript(
            speech_audio_ms
        )
        partial_transcript = self._combine_partial_transcript(
            self.state.last_partial_transcript
        )
        partial_transcript_at = self.state.last_partial_transcript_at
        partial_audio_bytes = self._combine_partial_audio_bytes(
            self.state.last_partial_transcript_audio_bytes
        )
        stable_partial_transcript = self._combine_partial_transcript(
            self.state.stable_partial_transcript
        )
        stable_partial_audio_bytes = self._combine_partial_audio_bytes(
            self.state.stable_partial_transcript_audio_bytes
        )
        partial_checkpoints = self._get_combined_partial_checkpoints()

        self.state.speech_buffer.clear()
        self.state.speech_active = False
        self.state.silence_ms = 0.0
        if self._partial_transcript_task and not self._partial_transcript_task.done():
            self._partial_transcript_task.cancel()
        self._partial_transcript_task = None
        self._reset_partial_tracking()

        if len(utterance) < int(
            DEFAULT_SAMPLE_RATE * 2 * (self._get_min_speech_ms() / 1000.0)
        ):
            return []

        return self._queue_utterance(
            utterance,
            speech_audio_ms=speech_audio_ms,
            transcript_hint=transcript_hint,
            partial_transcript=partial_transcript,
            partial_transcript_at=partial_transcript_at,
            partial_audio_bytes=partial_audio_bytes,
            stable_partial_transcript=stable_partial_transcript,
            stable_partial_audio_bytes=stable_partial_audio_bytes,
            partial_checkpoints=partial_checkpoints,
        )

    def _remember_pre_speech_chunk(self, chunk: bytes, chunk_ms: float) -> None:
        if not chunk:
            return

        self.state.pre_speech_chunks.append(chunk)
        self.state.pre_speech_buffer_ms += chunk_ms
        while (
            self.state.pre_speech_chunks
            and self.state.pre_speech_buffer_ms > PRE_SPEECH_BUFFER_MS
        ):
            dropped = self.state.pre_speech_chunks.popleft()
            dropped_ms = (len(dropped) / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
            self.state.pre_speech_buffer_ms = max(
                0.0,
                self.state.pre_speech_buffer_ms - dropped_ms,
            )

    def _consume_pre_speech_audio(self) -> bytes:
        if not self.state.pre_speech_chunks:
            return b''

        prefix = b''.join(self.state.pre_speech_chunks)
        self.state.pre_speech_chunks.clear()
        self.state.pre_speech_buffer_ms = 0.0
        return prefix

    def _clear_pre_speech_audio(self) -> None:
        self.state.pre_speech_chunks.clear()
        self.state.pre_speech_buffer_ms = 0.0

    async def _detect_voice_emotion(self, pcm_bytes: bytes) -> dict[str, Any] | None:
        if not getattr(self.voice_emotion_detector, 'available', False):
            return None

        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            temp_path = temp_audio.name

        try:
            _write_pcm16_wave(temp_path, pcm_bytes, DEFAULT_SAMPLE_RATE)
            try:
                label, confidence = await asyncio.to_thread(
                    self.voice_emotion_detector.detect,
                    temp_path,
                )
            except Exception:
                return None

            return {
                'label': label,
                'confidence': round(float(confidence), 4),
            }
        finally:
            with contextlib.suppress(OSError):
                os.remove(temp_path)

    async def _transcribe_audio(
        self,
        pcm_bytes: bytes,
        *,
        partial: bool = False,
        prefix_hint: str = '',
    ) -> str:
        transcribe_pcm = getattr(self.transcriber, 'transcribe_pcm', None)
        if callable(transcribe_pcm):
            try:
                transcript = await asyncio.to_thread(
                    transcribe_pcm,
                    pcm_bytes,
                    DEFAULT_SAMPLE_RATE,
                    self.config.speech_language,
                    partial=partial,
                    prefix_hint=prefix_hint,
                )
            except Exception as error:
                raise RuntimeError(
                    f"STT provider {getattr(self.transcriber, 'name', self.config.stt_provider)} failed: {error}"
                ) from error

            return _clean_text(str(transcript or ''))

        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            temp_path = temp_audio.name

        try:
            _write_pcm16_wave(temp_path, pcm_bytes, DEFAULT_SAMPLE_RATE)
            try:
                transcript = await asyncio.to_thread(
                    self.transcriber.transcribe,
                    temp_path,
                    self.config.speech_language,
                )
            except Exception as error:
                raise RuntimeError(
                    f"STT provider {getattr(self.transcriber, 'name', self.config.stt_provider)} failed: {error}"
                ) from error

            return _clean_text(str(transcript or ''))
        finally:
            with contextlib.suppress(OSError):
                os.remove(temp_path)

    async def _transcribe_incremental_partial(
        self,
        pcm_bytes: bytes,
    ) -> str:
        if not pcm_bytes:
            return ''

        previous_partial = _clean_text(self.state.last_partial_transcript)
        stable_partial = _clean_text(self.state.stable_partial_transcript)
        if not previous_partial:
            return await self._transcribe_audio(
                pcm_bytes,
                partial=True,
            )

        if not self._supports_native_pcm_transcription():
            return await self._transcribe_audio(
                pcm_bytes,
                partial=True,
                prefix_hint=previous_partial,
            )

        anchor = self._choose_incremental_anchor(
            pcm_bytes,
            partial_transcript=previous_partial,
            partial_transcript_at=self.state.last_partial_transcript_at,
            partial_audio_bytes=self.state.last_partial_transcript_audio_bytes,
            stable_partial_transcript=self.state.stable_partial_transcript,
            stable_partial_audio_bytes=self.state.stable_partial_transcript_audio_bytes,
            partial_checkpoints=list(self.state.partial_checkpoints),
            max_age_seconds=INCREMENTAL_PARTIAL_TRANSCRIPT_MAX_AGE_SECONDS,
            max_tail_ms=INCREMENTAL_PARTIAL_TRANSCRIPT_MAX_TAIL_MS,
        )
        if anchor is None:
            return await self._transcribe_audio(
                pcm_bytes,
                partial=True,
                prefix_hint=previous_partial,
            )

        anchor_prefix, anchor_audio_bytes = anchor
        tail_audio_bytes = len(pcm_bytes) - anchor_audio_bytes
        if tail_audio_bytes <= 0:
            return previous_partial or anchor_prefix

        tail_audio_ms = (tail_audio_bytes / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
        if tail_audio_ms <= (self._get_partial_transcript_force_delta_ms() * 0.5):
            return previous_partial or anchor_prefix

        overlap_bytes = int(
            DEFAULT_SAMPLE_RATE * 2 * (INCREMENTAL_PARTIAL_TRANSCRIPT_OVERLAP_MS / 1000.0)
        )
        tail_start = max(0, anchor_audio_bytes - overlap_bytes)
        tail_pcm = pcm_bytes[tail_start:]
        if not tail_pcm:
            return previous_partial or anchor_prefix

        tail_transcript = await self._transcribe_audio(
            tail_pcm,
            partial=True,
            prefix_hint=anchor_prefix,
        )
        tail_transcript = _clean_text(tail_transcript)
        if not tail_transcript:
            return previous_partial or anchor_prefix

        merged_from_anchor = _merge_incremental_transcript(
            anchor_prefix,
            tail_transcript,
        )
        merged = merged_from_anchor
        if previous_partial and previous_partial != anchor_prefix:
            merged_from_previous = _merge_incremental_transcript(
                previous_partial,
                tail_transcript,
            )
            if (
                _transcript_unit_count(merged_from_previous)
                > _transcript_unit_count(merged_from_anchor)
            ):
                merged = merged_from_previous

        audio_growth_ms = (
            max(0, len(pcm_bytes) - self.state.last_partial_transcript_audio_bytes)
            / 2
            / DEFAULT_SAMPLE_RATE
        ) * 1000.0

        selected = self._select_incremental_partial_candidate(
            candidates=[
                merged,
                merged_from_anchor,
                previous_partial,
                anchor_prefix,
            ],
            previous_partial=previous_partial,
            stable_partial=stable_partial,
            anchor_prefix=anchor_prefix,
            audio_growth_ms=audio_growth_ms,
        )
        return selected or previous_partial or anchor_prefix

    def _choose_incremental_anchor(
        self,
        utterance: bytes,
        *,
        partial_transcript: str,
        partial_transcript_at: float,
        partial_audio_bytes: int,
        stable_partial_transcript: str = '',
        stable_partial_audio_bytes: int = 0,
        partial_checkpoints: list[PartialTranscriptCheckpoint] | None = None,
        max_age_seconds: float = INCREMENTAL_FINAL_TRANSCRIPT_MAX_AGE_SECONDS,
        max_tail_ms: float = INCREMENTAL_FINAL_TRANSCRIPT_MAX_TAIL_MS,
    ) -> tuple[str, int] | None:
        utterance_len = len(utterance)
        if utterance_len <= 0:
            return None

        now = time.time()
        candidates: list[tuple[tuple[int, int, int, int, int, int, int], str, int]] = []
        checkpoint_items = list(partial_checkpoints or [])
        partial_clean = _clean_text(partial_transcript)
        stable_clean = _clean_text(stable_partial_transcript)

        def add_candidate(
            transcript: str,
            audio_bytes: int,
            *,
            transcript_at: float,
            stable: bool,
        ) -> None:
            transcript_clean = _clean_text(transcript)
            if not transcript_clean:
                return

            if (now - float(transcript_at or 0.0)) > max_age_seconds:
                return

            clamped_audio_bytes = max(0, min(int(audio_bytes or 0), utterance_len))
            if clamped_audio_bytes <= 0:
                return

            tail_audio_bytes = utterance_len - clamped_audio_bytes
            tail_audio_ms = (tail_audio_bytes / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
            within_limit = int(tail_audio_ms <= max_tail_ms)
            stable_match_units = _transcript_unit_count(
                _common_prefix_transcript(stable_clean, transcript_clean)
            )
            partial_match_units = _transcript_unit_count(
                _common_prefix_transcript(partial_clean, transcript_clean)
            )
            keeps_stable_prefix = int(
                not stable_clean
                or stable_match_units >= max(1, _transcript_unit_count(stable_clean) - 1)
            )
            score = (
                within_limit,
                int(stable),
                keeps_stable_prefix,
                stable_match_units,
                partial_match_units,
                _transcript_unit_count(transcript_clean),
                clamped_audio_bytes,
                int(transcript_at or 0.0),
            )
            candidates.append((score, transcript_clean, clamped_audio_bytes))

        add_candidate(
            stable_partial_transcript,
            stable_partial_audio_bytes,
            transcript_at=partial_transcript_at,
            stable=True,
        )
        add_candidate(
            partial_transcript,
            partial_audio_bytes,
            transcript_at=partial_transcript_at,
            stable=False,
        )
        for checkpoint in checkpoint_items:
            add_candidate(
                checkpoint.stable_transcript,
                checkpoint.stable_audio_bytes,
                transcript_at=checkpoint.transcript_at,
                stable=True,
            )
            add_candidate(
                checkpoint.transcript,
                checkpoint.audio_bytes,
                transcript_at=checkpoint.transcript_at,
                stable=False,
            )

        if not candidates:
            return None

        candidates.sort(reverse=True, key=lambda item: item[0])
        best_score, best_transcript, best_audio_bytes = candidates[0]
        if best_score[0] <= 0:
            return None

        return best_transcript, best_audio_bytes

    async def _transcribe_incremental_final(
        self,
        utterance: bytes,
        *,
        partial_transcript: str,
        partial_transcript_at: float,
        partial_audio_bytes: int,
        stable_partial_transcript: str = '',
        stable_partial_audio_bytes: int = 0,
        partial_checkpoints: list[PartialTranscriptCheckpoint] | None = None,
    ) -> str:
        partial_clean = _clean_text(partial_transcript)
        stable_clean = _clean_text(stable_partial_transcript)
        if not partial_clean and not stable_clean:
            return ''

        if not self._supports_native_pcm_transcription():
            return ''

        anchor = self._choose_incremental_anchor(
            utterance,
            partial_transcript=partial_clean,
            partial_transcript_at=partial_transcript_at,
            partial_audio_bytes=partial_audio_bytes,
            stable_partial_transcript=stable_clean,
            stable_partial_audio_bytes=stable_partial_audio_bytes,
            partial_checkpoints=partial_checkpoints,
        )
        if anchor is None:
            return ''

        anchor_prefix, anchor_audio_bytes = anchor
        tail_audio_bytes = len(utterance) - anchor_audio_bytes
        if tail_audio_bytes <= 0:
            return partial_clean or stable_clean

        tail_audio_ms = (tail_audio_bytes / 2 / DEFAULT_SAMPLE_RATE) * 1000.0
        if tail_audio_ms <= PARTIAL_TRANSCRIPT_REUSE_MAX_AUDIO_DELTA_MS and partial_clean:
            return partial_clean

        overlap_bytes = int(
            DEFAULT_SAMPLE_RATE * 2 * (INCREMENTAL_FINAL_TRANSCRIPT_OVERLAP_MS / 1000.0)
        )
        tail_start = max(0, anchor_audio_bytes - overlap_bytes)
        tail_pcm = utterance[tail_start:]
        if not tail_pcm:
            return partial_clean or stable_clean

        tail_transcript = await self._transcribe_audio(
            tail_pcm,
            prefix_hint=anchor_prefix,
        )
        tail_transcript = _clean_text(tail_transcript)
        if not tail_transcript:
            return partial_clean or stable_clean

        merged_from_anchor = _merge_incremental_transcript(anchor_prefix, tail_transcript)
        merged = merged_from_anchor
        if partial_clean and partial_clean != anchor_prefix:
            merged_from_partial = _merge_incremental_transcript(
                partial_clean,
                tail_transcript,
            )
            if (
                _transcript_unit_count(merged_from_partial)
                > _transcript_unit_count(merged_from_anchor)
            ):
                merged = merged_from_partial

        if merged == anchor_prefix and partial_clean:
            return partial_clean

        return merged or partial_clean or stable_clean

    async def _transcribe_and_detect(
        self,
        pcm_bytes: bytes,
        *,
        detect_voice_emotion: bool = True,
    ) -> tuple[str, dict[str, Any] | None]:
        transcript = await self._transcribe_audio(pcm_bytes)
        emotion_payload = None
        if detect_voice_emotion:
            emotion_payload = await self._detect_voice_emotion(pcm_bytes)

        return _clean_text(transcript), emotion_payload

    def _normalize_audio(self, pcm_bytes: bytes, sample_rate: int, channels: int) -> bytes:
        if not pcm_bytes:
            return b''

        mono_bytes = pcm_bytes
        if channels == 2:
            mono_bytes = audioop.tomono(pcm_bytes, 2, 0.5, 0.5)

        if sample_rate != DEFAULT_SAMPLE_RATE:
            converted, _state = audioop.ratecv(
                mono_bytes,
                2,
                1,
                sample_rate,
                DEFAULT_SAMPLE_RATE,
                None,
            )
            return converted

        return mono_bytes
