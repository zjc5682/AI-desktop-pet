"""
Chat backends for websocket_server.py.

Supported providers:
- `ollama`
- `qwen_local` via `llama-cpp-python`
- `openai` via OpenAI-compatible chat completions
- `zhipu` via BigModel chat completions

Optional search augmentation uses DuckDuckGo HTML results.
"""

from __future__ import annotations

import html
import json
import os
import re
import urllib.parse
from dataclasses import dataclass
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_TIMEOUT_SECONDS = 120
DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
DEFAULT_ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
DEFAULT_SEARCH_PROVIDER = 'duckduckgo'
DEFAULT_SEARCH_MAX_RESULTS = 5
DEFAULT_USER_AGENT = 'TablePet/0.1'
PROMPT_ASSISTANT_MARKER = '\nAssistant:'
SEARCH_HINTS = (
    '/search',
    '搜索',
    '查一下',
    '帮我查',
    '联网',
    '最新',
    '今天',
    '明天',
    '后天',
    '实时',
    '新闻',
    '天气',
    '价格',
    '汇率',
    '比分',
    '股价',
    '时间',
    '日期',
    'latest',
    'today',
    'tomorrow',
    'news',
    'weather',
    'price',
    'exchange rate',
    'stock',
    'score',
    'current',
)
GREETING_HINTS = ('你好', 'hello', 'hi', '早上好', '晚上好')
RESULT_LINK_RE = re.compile(
    r'<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
RESULT_SNIPPET_RE = re.compile(
    r'<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(?P<snippet>.*?)</(?:a|div)>',
    re.IGNORECASE | re.DOTALL,
)
LAST_USER_BLOCK_RE = re.compile(
    r'User:\s*(?P<content>.*?)(?:\nAssistant:\s*$|\Z)',
    re.IGNORECASE | re.DOTALL,
)
SERIALIZED_ROLE_LINE_RE = re.compile(
    r'^(?P<role>System|User|Assistant|Tool):(?:\s*(?P<content>.*))?$',
    re.IGNORECASE,
)


def _clean_text(text: str) -> str:
    return ' '.join(str(text or '').strip().split())


def _chunk_text(text: str, chunk_size: int = 24) -> Iterable[str]:
    normalized = str(text or '')
    if not normalized:
        return []

    chunks: list[str] = []
    cursor = 0
    while cursor < len(normalized):
        chunks.append(normalized[cursor : cursor + chunk_size])
        cursor += chunk_size
    return chunks


def _strip_html(raw_html: str) -> str:
    without_tags = re.sub(r'<[^>]+>', ' ', raw_html or '')
    decoded = html.unescape(without_tags)
    return _clean_text(decoded)


def _normalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme:
        return url.rstrip('/')
    return f'https://{url.strip().strip("/")}'


def _normalize_duckduckgo_result_url(url: str) -> str:
    if not url:
        return ''

    decoded = html.unescape(url)
    if decoded.startswith('//'):
        return f'https:{decoded}'

    if decoded.startswith('/'):
        query = urllib.parse.urlsplit(decoded).query
        params = urllib.parse.parse_qs(query)
        redirected = params.get('uddg')
        if redirected:
            return urllib.parse.unquote(redirected[0])
        return f'https://duckduckgo.com{decoded}'

    return decoded


def _extract_message_text(value: Any) -> str:
    if isinstance(value, str):
        return value

    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
                continue
            if not isinstance(item, dict):
                continue
            text = item.get('text')
            if isinstance(text, str):
                parts.append(text)
                continue
            nested_text = item.get('content')
            if isinstance(nested_text, str):
                parts.append(nested_text)
        return ''.join(parts)

    if isinstance(value, dict):
        return _extract_message_text(value.get('text') or value.get('content'))

    return ''


def _iter_sse_payloads(response) -> Iterable[dict[str, Any]]:
    event_lines: list[str] = []

    for raw_line in response:
        line = raw_line.decode('utf-8', errors='ignore').strip()
        if not line:
            if not event_lines:
                continue

            payload = ''.join(
                item[5:].strip() for item in event_lines if item.startswith('data:')
            )
            event_lines.clear()

            if not payload or payload == '[DONE]':
                continue

            try:
                yield json.loads(payload)
            except json.JSONDecodeError:
                continue
            continue

        if line.startswith('data:') or line.startswith('event:'):
            event_lines.append(line)

    if event_lines:
        payload = ''.join(
            item[5:].strip() for item in event_lines if item.startswith('data:')
        )
        if payload and payload != '[DONE]':
            with_context = payload
            try:
                yield json.loads(with_context)
            except json.JSONDecodeError:
                return


def _extract_user_text(message: str, metadata: dict[str, Any] | None) -> str:
    if metadata:
        raw_user_text = metadata.get('userText')
        if isinstance(raw_user_text, str) and raw_user_text.strip():
            return _clean_text(raw_user_text)

    matches = LAST_USER_BLOCK_RE.findall(message or '')
    if matches:
        return _clean_text(matches[-1])

    return _clean_text(message)


def _parse_chat_messages(prompt: str) -> list[dict[str, str]]:
    raw_prompt = str(prompt or '').replace('\r\n', '\n')
    if not raw_prompt.strip():
        return []

    messages: list[dict[str, str]] = []
    preamble_lines: list[str] = []
    current_role: str | None = None
    current_lines: list[str] = []

    def flush_current() -> None:
        nonlocal current_role, current_lines
        if current_role is None:
            return

        content = '\n'.join(current_lines).strip()
        if content or current_role != 'assistant':
            messages.append({'role': current_role, 'content': content})
        current_role = None
        current_lines = []

    for raw_line in raw_prompt.split('\n'):
        line = raw_line.rstrip()
        match = SERIALIZED_ROLE_LINE_RE.match(line.strip())
        if match:
            role = str(match.group('role') or '').strip().lower()
            inline_content = str(match.group('content') or '')

            if preamble_lines and not messages and current_role is None:
                preamble = '\n'.join(preamble_lines).strip()
                if preamble:
                    messages.append({'role': 'system', 'content': preamble})
                preamble_lines.clear()

            flush_current()
            current_role = role
            current_lines = [inline_content] if inline_content else []
            continue

        if current_role is None:
            preamble_lines.append(line)
            continue

        current_lines.append(line)

    if preamble_lines and not messages and current_role is None:
        preamble = '\n'.join(preamble_lines).strip()
        if preamble:
            messages.append({'role': 'system', 'content': preamble})

    flush_current()

    while messages and messages[-1]['role'] == 'assistant' and not messages[-1]['content'].strip():
        messages.pop()

    if not any(message['role'] == 'user' for message in messages):
        return []

    return [
        {
            'role': message['role'],
            'content': str(message['content'] or '').strip(),
        }
        for message in messages
        if str(message['content'] or '').strip() or message['role'] != 'assistant'
    ]


def _inject_context_into_prompt(prompt: str, context_block: str) -> str:
    if not context_block.strip():
        return prompt

    marker_index = prompt.rfind(PROMPT_ASSISTANT_MARKER)
    if marker_index == -1:
        return f'{prompt.rstrip()}\n\n{context_block.strip()}\n'

    prefix = prompt[:marker_index].rstrip()
    suffix = prompt[marker_index:]
    return f'{prefix}\n\n{context_block.strip()}{suffix}'


def _should_use_search(query: str) -> bool:
    normalized = _clean_text(query).lower()
    if not normalized or normalized in GREETING_HINTS:
        return False

    return any(hint in normalized for hint in SEARCH_HINTS) or '?' in normalized or '？' in normalized


@dataclass
class SearchResultItem:
    title: str
    url: str
    snippet: str


class DuckDuckGoSearchService:
    def __init__(self, max_results: int = DEFAULT_SEARCH_MAX_RESULTS) -> None:
        self.max_results = max(1, int(max_results or DEFAULT_SEARCH_MAX_RESULTS))

    def search(self, query: str, limit: int | None = None) -> list[SearchResultItem]:
        search_limit = max(1, int(limit or self.max_results))
        encoded_query = urllib.parse.urlencode({'q': query, 'kl': 'cn-zh', 'kp': '-2'})
        request = Request(
            f'https://html.duckduckgo.com/html/?{encoded_query}',
            headers={
                'User-Agent': DEFAULT_USER_AGENT,
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            method='GET',
        )

        with urlopen(request, timeout=15) as response:
            raw_html = response.read().decode('utf-8', errors='ignore')

        titles = list(RESULT_LINK_RE.finditer(raw_html))
        snippets = list(RESULT_SNIPPET_RE.finditer(raw_html))
        results: list[SearchResultItem] = []

        for index, title_match in enumerate(titles[:search_limit]):
            title = _strip_html(title_match.group('title'))
            url = _normalize_duckduckgo_result_url(title_match.group('href'))
            snippet_match = snippets[index] if index < len(snippets) else None
            snippet = _strip_html(snippet_match.group('snippet')) if snippet_match else ''
            if not title or not url:
                continue
            results.append(
                SearchResultItem(
                    title=title,
                    url=url,
                    snippet=snippet,
                )
            )

        return results


class DummyChatService:
    def __init__(self, message: str | None = None) -> None:
        self.message = message or (
            'Chat backend is running in fallback mode. '
            'Start a real model backend or update the chat settings.'
        )

    def generate(
        self,
        message: str,
        history=None,
        personality=None,
        style_vec=None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        _ = message, history, personality, style_vec, metadata
        return self.message

    def generate_stream(
        self,
        message: str,
        history=None,
        personality=None,
        style_vec=None,
        metadata: dict[str, Any] | None = None,
    ) -> Iterable[str]:
        _ = message, history, personality, style_vec, metadata
        return _chunk_text(self.message, 18)


class BaseChatService:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.temperature = float(config.get('temperature', 0.7))
        self.max_tokens = int(config.get('max_tokens', 2048))
        self.search_enabled = bool(config.get('search_enabled', False))
        self.search_provider = str(
            config.get('search_provider', DEFAULT_SEARCH_PROVIDER)
        ).strip() or DEFAULT_SEARCH_PROVIDER
        self.search_max_results = max(
            1,
            int(config.get('search_max_results', DEFAULT_SEARCH_MAX_RESULTS) or DEFAULT_SEARCH_MAX_RESULTS),
        )
        self.search_service = self._create_search_service()

    def _create_search_service(self) -> DuckDuckGoSearchService | None:
        if not self.search_enabled:
            return None

        if self.search_provider == 'duckduckgo':
            return DuckDuckGoSearchService(self.search_max_results)

        return None

    def _augment_prompt(
        self,
        message: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        prompt = str(message or '')
        if not self.search_service:
            return prompt

        query = _extract_user_text(prompt, metadata)
        if not _should_use_search(query):
            return prompt

        query = query.removeprefix('/search').strip()
        if not query:
            return prompt

        try:
            results = self.search_service.search(query, self.search_max_results)
        except Exception as error:
            search_context = (
                'Current web search was requested but failed.\n'
                f'Error: {error}\n'
                'If current information is necessary, say you could not fetch it.'
            )
            return _inject_context_into_prompt(prompt, search_context)

        if not results:
            return _inject_context_into_prompt(
                prompt,
                'Current web search was requested but returned no usable results.',
            )

        lines = [
            'Current web search context (DuckDuckGo):',
        ]
        for index, item in enumerate(results, start=1):
            lines.append(f'{index}. {item.title}')
            lines.append(f'URL: {item.url}')
            if item.snippet:
                lines.append(f'Snippet: {item.snippet}')
        lines.append(
            'Use the search context above only when it helps answer the latest user request. '
            'If it is insufficient, say so instead of inventing facts.'
        )

        return _inject_context_into_prompt(prompt, '\n'.join(lines))


class OllamaChatService(BaseChatService):
    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self.base_url = _normalize_url(
            str(config.get('ollama_url', 'http://localhost:11434'))
        )
        self.model = str(config.get('ollama_model', 'qwen2.5:7b'))

    def _request(self, endpoint: str, payload: dict[str, Any]):
        request = Request(
            f'{self.base_url}{endpoint}',
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        return urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS)

    def generate(
        self,
        message: str,
        history=None,
        personality=None,
        style_vec=None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        _ = history, personality, style_vec
        prompt = self._augment_prompt(message, metadata)
        messages = _parse_chat_messages(prompt)
        try:
            if messages:
                with self._request(
                    '/api/chat',
                    {
                        'model': self.model,
                        'messages': messages,
                        'stream': False,
                        'options': {
                            'temperature': self.temperature,
                            'num_predict': self.max_tokens,
                        },
                    },
                ) as response:
                    payload = json.loads(response.read().decode('utf-8'))
                    message_payload = payload.get('message')
                    if isinstance(message_payload, dict):
                        return _clean_text(
                            _extract_message_text(message_payload.get('content'))
                        )

            with self._request(
                '/api/generate',
                {
                    'model': self.model,
                    'prompt': prompt,
                    'stream': False,
                    'options': {
                        'temperature': self.temperature,
                        'num_predict': self.max_tokens,
                    },
                },
            ) as response:
                payload = json.loads(response.read().decode('utf-8'))
                return _clean_text(str(payload.get('response', '')))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            return f'Ollama request failed: {error}'

    def generate_stream(
        self,
        message: str,
        history=None,
        personality=None,
        style_vec=None,
        metadata: dict[str, Any] | None = None,
    ) -> Iterable[str]:
        _ = history, personality, style_vec
        prompt = self._augment_prompt(message, metadata)
        messages = _parse_chat_messages(prompt)
        try:
            if messages:
                with self._request(
                    '/api/chat',
                    {
                        'model': self.model,
                        'messages': messages,
                        'stream': True,
                        'options': {
                            'temperature': self.temperature,
                            'num_predict': self.max_tokens,
                        },
                    },
                ) as response:
                    for raw_line in response:
                        line = raw_line.decode('utf-8', errors='ignore').strip()
                        if not line:
                            continue

                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        message_payload = chunk.get('message')
                        if not isinstance(message_payload, dict):
                            continue

                        content = _extract_message_text(message_payload.get('content'))
                        if content:
                            yield content
                return

            with self._request(
                '/api/generate',
                {
                    'model': self.model,
                    'prompt': prompt,
                    'stream': True,
                    'options': {
                        'temperature': self.temperature,
                        'num_predict': self.max_tokens,
                    },
                },
            ) as response:
                for raw_line in response:
                    line = raw_line.decode('utf-8', errors='ignore').strip()
                    if not line:
                        continue

                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    content = str(chunk.get('response', ''))
                    if content:
                        yield content
        except (HTTPError, URLError, TimeoutError) as error:
            fallback = f'Ollama request failed: {error}'
            for chunk in _chunk_text(fallback, 18):
                yield chunk


class QwenLocalChatService(BaseChatService):
    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        qwen_config = dict(config.get('qwen_local') or {})
        self.model_path = str(qwen_config.get('model_path') or 'models/qwen.gguf')
        self.n_ctx = int(qwen_config.get('n_ctx') or 4096)
        self.n_threads = int(qwen_config.get('n_threads') or max(1, os.cpu_count() or 4))
        self.n_gpu_layers = int(qwen_config.get('n_gpu_layers') or 0)

        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"Local Qwen model was not found at '{self.model_path}'."
            )

        from llama_cpp import Llama  # type: ignore

        self.llm = Llama(
            model_path=self.model_path,
            n_ctx=self.n_ctx,
            n_threads=self.n_threads,
            n_gpu_layers=self.n_gpu_layers,
            verbose=False,
        )

    def generate(
        self,
        message: str,
        history=None,
        personality=None,
        style_vec=None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        _ = history, personality, style_vec
        prompt = self._augment_prompt(message, metadata)
        response = self.llm(
            prompt,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            stop=['\nSystem:', '\nUser:'],
        )
        choices = response.get('choices') if isinstance(response, dict) else None
        if not isinstance(choices, list) or not choices:
            return ''
        first = choices[0]
        if not isinstance(first, dict):
            return ''
        return _clean_text(str(first.get('text') or ''))

    def generate_stream(
        self,
        message: str,
        history=None,
        personality=None,
        style_vec=None,
        metadata: dict[str, Any] | None = None,
    ) -> Iterable[str]:
        _ = history, personality, style_vec
        prompt = self._augment_prompt(message, metadata)
        try:
            stream = self.llm(
                prompt,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                stop=['\nSystem:', '\nUser:'],
                stream=True,
            )
            for chunk in stream:
                choices = chunk.get('choices') if isinstance(chunk, dict) else None
                if not isinstance(choices, list) or not choices:
                    continue
                first = choices[0]
                if not isinstance(first, dict):
                    continue
                text = str(first.get('text') or '')
                if text:
                    yield text
        except Exception:
            full_text = self.generate(
                message,
                history=history,
                personality=personality,
                style_vec=style_vec,
                metadata=metadata,
            )
            for chunk in _chunk_text(full_text, 18):
                yield chunk


class OpenAICompatibleChatService(BaseChatService):
    def __init__(
        self,
        config: dict[str, Any],
        *,
        provider_name: str,
        base_url_key: str,
        api_key_key: str,
        model_key: str,
        default_base_url: str,
        default_model: str,
    ) -> None:
        super().__init__(config)
        self.provider_name = provider_name
        self.base_url = _normalize_url(
            str(config.get(base_url_key, default_base_url))
        )
        self.api_key = str(config.get(api_key_key, '') or '').strip()
        self.model = str(config.get(model_key, default_model) or default_model)

        if not self.api_key:
            raise ValueError(f'{provider_name} API key is empty.')

    def _request(self, messages: list[dict[str, str]], stream: bool):
        payload = {
            'model': self.model,
            'messages': messages,
            'temperature': self.temperature,
            'max_tokens': self.max_tokens,
            'stream': stream,
        }
        request = Request(
            f'{self.base_url}/chat/completions',
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.api_key}',
                'User-Agent': DEFAULT_USER_AGENT,
            },
            method='POST',
        )
        return urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS)

    def generate(
        self,
        message: str,
        history=None,
        personality=None,
        style_vec=None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        _ = history, personality, style_vec
        prompt = self._augment_prompt(message, metadata)
        messages = _parse_chat_messages(prompt) or [{'role': 'user', 'content': prompt}]
        with self._request(messages, stream=False) as response:
            payload = json.loads(response.read().decode('utf-8'))
        choices = payload.get('choices')
        if not isinstance(choices, list) or not choices:
            return ''
        first = choices[0]
        if not isinstance(first, dict):
            return ''
        message_payload = first.get('message')
        if not isinstance(message_payload, dict):
            return ''
        return _clean_text(_extract_message_text(message_payload.get('content')))

    def generate_stream(
        self,
        message: str,
        history=None,
        personality=None,
        style_vec=None,
        metadata: dict[str, Any] | None = None,
    ) -> Iterable[str]:
        _ = history, personality, style_vec
        prompt = self._augment_prompt(message, metadata)
        messages = _parse_chat_messages(prompt) or [{'role': 'user', 'content': prompt}]
        emitted_any = False

        try:
            with self._request(messages, stream=True) as response:
                for payload in _iter_sse_payloads(response):
                    choices = payload.get('choices')
                    if not isinstance(choices, list) or not choices:
                        continue
                    first = choices[0]
                    if not isinstance(first, dict):
                        continue
                    delta = first.get('delta')
                    if not isinstance(delta, dict):
                        continue
                    content = _extract_message_text(delta.get('content'))
                    if content:
                        emitted_any = True
                        yield content
        except Exception as error:
            fallback = f'{self.provider_name} request failed: {error}'
            for chunk in _chunk_text(fallback, 18):
                yield chunk
            return

        if not emitted_any:
            full_text = self.generate(
                message,
                history=history,
                personality=personality,
                style_vec=style_vec,
                metadata=metadata,
            )
            for chunk in _chunk_text(full_text, 18):
                yield chunk


def create_chat_service(config: dict):
    provider = str(config.get('chat_provider', 'ollama') or 'ollama').strip().lower()

    try:
        if provider == 'ollama':
            return OllamaChatService(config)

        if provider == 'qwen_local':
            return QwenLocalChatService(config)

        if provider == 'openai':
            return OpenAICompatibleChatService(
                config,
                provider_name='OpenAI',
                base_url_key='openai_base_url',
                api_key_key='openai_api_key',
                model_key='openai_model',
                default_base_url=DEFAULT_OPENAI_BASE_URL,
                default_model='gpt-4.1-mini',
            )

        if provider == 'zhipu':
            return OpenAICompatibleChatService(
                config,
                provider_name='Zhipu',
                base_url_key='zhipu_base_url',
                api_key_key='zhipu_api_key',
                model_key='zhipu_model',
                default_base_url=DEFAULT_ZHIPU_BASE_URL,
                default_model='glm-4.5-air',
            )
    except Exception as error:
        return DummyChatService(f'{provider} backend is unavailable: {error}')

    return DummyChatService(f"Unknown chat provider '{provider}'.")


chat_service = None


def init_chat_service(config: dict):
    global chat_service
    chat_service = create_chat_service(config)
    return chat_service
