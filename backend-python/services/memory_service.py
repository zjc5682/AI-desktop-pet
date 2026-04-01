from __future__ import annotations

import hashlib
import json
import math
import re
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

VECTOR_DIM = 256
TOKEN_PATTERN = re.compile(r'[A-Za-z0-9]+|[\u4e00-\u9fff]+')


def _now_iso() -> str:
    return datetime.now().isoformat(timespec='seconds')


def _normalize_text(text: Any) -> str:
    if not isinstance(text, str):
        return ''
    return re.sub(r'\s+', ' ', text).strip()


def _tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(_normalize_text(text).lower())


def _score_text_match(query: str, candidate: str) -> float:
    query_tokens = _tokenize(query)
    if not query_tokens:
        return 0.0

    candidate_text = _normalize_text(candidate).lower()
    if not candidate_text:
        return 0.0

    hits = sum(1 for token in query_tokens if token in candidate_text)
    return hits / max(1, len(query_tokens))


def _embed_text(text: str, dim: int = VECTOR_DIM) -> list[float]:
    vector = [0.0] * dim
    for token in _tokenize(text):
        digest = hashlib.blake2b(token.encode('utf-8'), digest_size=16).digest()
        slot = int.from_bytes(digest[:4], 'little') % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + min(len(token), 12) * 0.05
        vector[slot] += sign * weight

    norm = math.sqrt(sum(value * value for value in vector))
    if norm <= 0:
        return vector

    return [value / norm for value in vector]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0

    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm <= 0 or right_norm <= 0:
        return 0.0

    return max(0.0, min(1.0, dot / (left_norm * right_norm)))


def _pad_date(value: int) -> str:
    return str(value).zfill(2)


def _normalize_reminder_date(raw_text: str, now: datetime | None = None) -> str | None:
    normalized = _normalize_text(raw_text)
    if not normalized:
        return None

    now = now or datetime.now()
    full_date_match = re.search(r'\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b', normalized)
    if full_date_match:
        year = int(full_date_match.group(1))
        month = int(full_date_match.group(2))
        day = int(full_date_match.group(3))
        return f'{year}-{_pad_date(month)}-{_pad_date(day)}'

    chinese_month_day_match = re.search(r'(\d{1,2})月(\d{1,2})(?:日|号)?', normalized)
    if chinese_month_day_match:
        month = int(chinese_month_day_match.group(1))
        day = int(chinese_month_day_match.group(2))
        return f'{now.year}-{_pad_date(month)}-{_pad_date(day)}'

    base_date = datetime(now.year, now.month, now.day)
    if '后天' in normalized:
        return (base_date + timedelta(days=2)).strftime('%Y-%m-%d')
    if '明天' in normalized:
        return (base_date + timedelta(days=1)).strftime('%Y-%m-%d')
    if '今天' in normalized:
        return base_date.strftime('%Y-%m-%d')
    return None


def _normalize_fact_value(value: str) -> str:
    return _normalize_text(value)


def _slugify_fact_value(value: str) -> str:
    normalized = _normalize_fact_value(value)
    return (
        re.sub(r'[^\w\u4e00-\u9fff]+', '-', normalized.lower())
        .strip('-')
        .strip()
    )[:48]


def _build_profile_fact(
    prefix: str,
    value: str,
    updated_at: str,
    confidence: float,
) -> dict[str, Any] | None:
    normalized_value = _normalize_fact_value(value)
    slug = _slugify_fact_value(normalized_value)
    if not normalized_value or not slug:
        return None

    return {
        'key': f'{prefix}:{slug}',
        'value': normalized_value,
        'confidence': confidence,
        'updatedAt': updated_at,
    }


def _extract_reminder_facts(turn: dict[str, Any]) -> list[dict[str, Any]]:
    if str(turn.get('role') or '') != 'user':
        return []

    text = _normalize_text(turn.get('content'))
    if not text:
        return []

    reminder_date = _normalize_reminder_date(text)
    if not reminder_date:
        return []

    reminder_keywords = [
        '提醒',
        '考试',
        '开会',
        '面试',
        '答辩',
        '出发',
        '生日',
        '提交',
        '截止',
        'deadline',
        'ddl',
        'meeting',
        'interview',
        'exam',
        'birthday',
    ]
    lowered = text.lower()
    if not any(keyword.lower() in lowered for keyword in reminder_keywords):
        return []

    slug = (
        re.sub(r'[^\w\u4e00-\u9fff]+', '-', text[:24])
        .strip('-')
        .strip()
    ) or 'event'

    return [
        {
            'key': f'reminder:{reminder_date}:{slug}',
            'value': text,
            'confidence': 0.82,
            'updatedAt': str(turn.get('createdAt') or _now_iso()),
        }
    ]


def _extract_profile_facts(turn: dict[str, Any]) -> list[dict[str, Any]]:
    if str(turn.get('role') or '') != 'user':
        return []

    text = _normalize_fact_value(str(turn.get('content') or ''))
    if not text:
        return []

    created_at = str(turn.get('createdAt') or _now_iso())
    facts: list[dict[str, Any]] = []
    rules: list[tuple[str, float, list[re.Pattern[str]]]] = [
        (
            'identity:name',
            0.93,
            [
                re.compile(r'\bmy name is\s+([^.!?,\n]+)', re.IGNORECASE),
                re.compile(r'\bi am called\s+([^.!?,\n]+)', re.IGNORECASE),
                re.compile(r'(?:^|[，。！？\s])我叫([^，。！？\n]+)'),
                re.compile(r'(?:^|[，。！？\s])我是([^，。！？\n]{1,24})'),
            ],
        ),
        (
            'preference:like',
            0.78,
            [
                re.compile(
                    r'\b(?:i|we)\s+(?:really\s+)?(?:like|love|enjoy|prefer)\s+([^.!?,\n]+)',
                    re.IGNORECASE,
                ),
                re.compile(r'(?:^|[，。！？\s])我(?:很)?(?:喜欢|爱|偏爱)([^，。！？\n]+)'),
            ],
        ),
        (
            'preference:dislike',
            0.8,
            [
                re.compile(
                    r"\b(?:i|we)\s+(?:really\s+)?(?:dislike|hate|do not like|don't like)\s+([^.!?,\n]+)",
                    re.IGNORECASE,
                ),
                re.compile(r'(?:^|[，。！？\s])我(?:不喜欢|讨厌|不爱)([^，。！？\n]+)'),
            ],
        ),
        (
            'habit',
            0.72,
            [
                re.compile(
                    r'\b(?:i|we)\s+(?:usually|often|always|tend to)\s+([^.!?,\n]+)',
                    re.IGNORECASE,
                ),
                re.compile(r'(?:^|[，。！？\s])我(?:经常|通常|一般|习惯)([^，。！？\n]+)'),
            ],
        ),
    ]

    for prefix, confidence, expressions in rules:
        for expression in expressions:
            match = expression.search(text)
            if not match:
                continue
            fact = _build_profile_fact(prefix, match.group(1), created_at, confidence)
            if fact is not None:
                facts.append(fact)
            break

    return facts


def _extract_facts_from_turn(turn: dict[str, Any]) -> list[dict[str, Any]]:
    facts_by_key: dict[str, dict[str, Any]] = {}
    for fact in [*_extract_reminder_facts(turn), *_extract_profile_facts(turn)]:
        key = str(fact.get('key') or '')
        if key:
            facts_by_key[key] = fact
    return list(facts_by_key.values())


def _collect_fact_values(facts: list[dict[str, Any]], prefix: str) -> list[str]:
    values: list[str] = []
    seen: set[str] = set()
    for fact in facts:
        key = str(fact.get('key') or '')
        value = str(fact.get('value') or '')
        if key.startswith(prefix) and value and value not in seen:
            seen.add(value)
            values.append(value)
    return values


def _build_profile_snapshot(facts: list[dict[str, Any]]) -> dict[str, Any]:
    ordered_facts = sorted(
        facts,
        key=lambda fact: str(fact.get('updatedAt') or ''),
        reverse=True,
    )
    name_fact = next(
        (fact for fact in ordered_facts if str(fact.get('key') or '').startswith('identity:name:')),
        None,
    )
    reminders = [
        fact for fact in ordered_facts if str(fact.get('key') or '').startswith('reminder:')
    ]
    return {
        'name': name_fact.get('value') if name_fact else None,
        'likes': _collect_fact_values(ordered_facts, 'preference:like:'),
        'dislikes': _collect_fact_values(ordered_facts, 'preference:dislike:'),
        'habits': _collect_fact_values(ordered_facts, 'habit:'),
        'reminders': reminders,
        'facts': ordered_facts,
    }


def _build_relationship_state(
    turns: list[dict[str, Any]],
    facts: list[dict[str, Any]],
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    user_turns = sum(1 for turn in turns if str(turn.get('role') or '') == 'user')
    assistant_turns = sum(1 for turn in turns if str(turn.get('role') or '') == 'assistant')
    reminder_count = sum(
        1 for fact in facts if str(fact.get('key') or '').startswith('reminder:')
    )
    profile_fact_count = max(0, len(facts) - reminder_count)
    affection = min(
        100,
        user_turns * 4
        + assistant_turns * 2
        + min(profile_fact_count, 10) * 5
        + min(len(events), 20),
    )

    level = 'new'
    if affection >= 70:
        level = 'trusted'
    elif affection >= 45:
        level = 'close'
    elif affection >= 20:
        level = 'warming'

    mood = 'idle'
    hour = datetime.now().hour
    recent_event_kinds = [str(event.get('kind') or '') for event in events[-6:]]
    if hour >= 23 or hour <= 5:
        mood = 'sleepy'
    elif any('clipboard-code' in kind or 'clipboard-error' in kind for kind in recent_event_kinds):
        mood = 'focused'
    elif any('pomodoro-complete' in kind for kind in recent_event_kinds):
        mood = 'excited'
    elif affection >= 70:
        mood = 'happy'

    last_interaction_at = turns[-1].get('createdAt') if turns else None
    return {
        'affection': affection,
        'level': level,
        'mood': mood,
        'userTurns': user_turns,
        'assistantTurns': assistant_turns,
        'profileFactCount': profile_fact_count,
        'reminderCount': reminder_count,
        'lastInteractionAt': last_interaction_at,
    }


class MemoryService:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        import duckdb  # type: ignore

        self.duckdb = duckdb
        self.lock = threading.RLock()
        root = self._resolve_memory_root(config or {})
        root.mkdir(parents=True, exist_ok=True)
        self.db_path = root / 'companion_memory.duckdb'
        self.lance_path = root / 'lancedb'
        self.conn = duckdb.connect(str(self.db_path))

        self.lancedb = None
        self._lance_db = None
        self._lance_table = None
        self._lance_dirty = True
        self._lance_row_count = 0

        try:
            import lancedb  # type: ignore

            self.lancedb = lancedb
            self._lance_db = lancedb.connect(str(self.lance_path))
        except Exception:
            self.lancedb = None
            self._lance_db = None

        self._init_schema()

    def _resolve_memory_root(self, config: dict[str, Any]) -> Path:
        raw_root = str(config.get('memory_dir') or '').strip()
        if raw_root:
            candidate = Path(raw_root)
            if not candidate.is_absolute():
                candidate = Path(__file__).resolve().parents[1] / candidate
            return candidate
        return Path(__file__).resolve().parents[1] / 'data' / 'memory'

    def _init_schema(self) -> None:
        with self.lock:
            self.conn.execute(
                '''
                CREATE TABLE IF NOT EXISTS turns (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    role TEXT,
                    content TEXT,
                    created_at TIMESTAMP,
                    metadata_json TEXT
                )
                '''
            )
            self.conn.execute(
                '''
                CREATE TABLE IF NOT EXISTS facts (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    confidence DOUBLE,
                    updated_at TIMESTAMP
                )
                '''
            )
            self.conn.execute(
                '''
                CREATE TABLE IF NOT EXISTS diary_entries (
                    id TEXT PRIMARY KEY,
                    date TEXT,
                    summary TEXT,
                    mood TEXT,
                    tags_json TEXT
                )
                '''
            )
            self.conn.execute(
                '''
                CREATE TABLE IF NOT EXISTS event_summaries (
                    kind TEXT,
                    summary TEXT,
                    timestamp TIMESTAMP
                )
                '''
            )
            self.conn.execute(
                '''
                CREATE TABLE IF NOT EXISTS memory_chunks (
                    chunk_id TEXT PRIMARY KEY,
                    source_ref TEXT,
                    source TEXT,
                    summary TEXT,
                    created_at TIMESTAMP,
                    metadata_json TEXT,
                    vector_json TEXT
                )
                '''
            )

    def save_message(self, turn: dict[str, Any]) -> None:
        turn_id = str(turn.get('id') or '').strip()
        if not turn_id:
            raise ValueError('Memory turn id is required.')

        session_id = str(turn.get('sessionId') or 'default').strip() or 'default'
        role = str(turn.get('role') or 'user').strip() or 'user'
        content = _normalize_text(turn.get('content'))
        created_at = str(turn.get('createdAt') or _now_iso())
        metadata = turn.get('metadata') if isinstance(turn.get('metadata'), dict) else {}

        with self.lock:
            self.conn.execute(
                '''
                INSERT OR REPLACE INTO turns (
                    id, session_id, role, content, created_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                ''',
                [
                    turn_id,
                    session_id,
                    role,
                    content,
                    created_at,
                    json.dumps(metadata, ensure_ascii=False),
                ],
            )
            self._upsert_chunk_locked(
                chunk_id=f'turn:{turn_id}',
                source_ref=turn_id,
                source='conversation',
                summary=content,
                created_at=created_at,
                metadata={
                    'role': role,
                    'sessionId': session_id,
                    **metadata,
                },
            )
            for fact in _extract_facts_from_turn(
                {
                    'role': role,
                    'content': content,
                    'createdAt': created_at,
                }
            ):
                self._upsert_fact_locked(fact)

    def search_relevant(
        self,
        query: str,
        options: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        options = options or {}
        limit = max(1, int(options.get('limit') or 5))
        min_score = float(options.get('minScore') or 0.2)
        query_text = _normalize_text(query)
        query_vector = _embed_text(query_text)

        with self.lock:
            rows = self.conn.execute(
                '''
                SELECT chunk_id, source_ref, source, summary, created_at, metadata_json, vector_json
                FROM memory_chunks
                ORDER BY created_at DESC
                LIMIT 800
                '''
            ).fetchall()
            if not query_text:
                return self._recent_conversation_locked(limit)

            lance_scores = self._search_lance_locked(query_text, max(limit * 4, 12))
            matches: list[dict[str, Any]] = []
            for row in rows:
                chunk_id = str(row[0] or '')
                source_ref = str(row[1] or chunk_id)
                source = str(row[2] or 'system')
                summary = _normalize_text(row[3] or '')
                created_at = self._serialize_time(row[4])
                metadata = self._parse_json(row[5], {})
                vector = self._parse_vector_json(row[6])
                lexical_score = _score_text_match(query_text, f'{summary} {source_ref}')
                vector_score = _cosine_similarity(query_vector, vector)
                lance_score = float(lance_scores.get(chunk_id, 0.0))
                final_score = max(lexical_score, vector_score * 0.92, lance_score)
                if final_score < min_score:
                    continue
                matches.append(
                    {
                        'id': source_ref,
                        'summary': summary,
                        'source': source,
                        'createdAt': created_at,
                        'score': round(final_score, 4),
                        'metadata': metadata,
                    }
                )

            matches.sort(
                key=lambda item: (
                    float(item.get('score') or 0.0),
                    str(item.get('createdAt') or ''),
                ),
                reverse=True,
            )
            deduped: list[dict[str, Any]] = []
            seen_ids: set[str] = set()
            for item in matches:
                item_id = str(item.get('id') or '')
                if item_id in seen_ids:
                    continue
                seen_ids.add(item_id)
                deduped.append(item)
                if len(deduped) >= limit:
                    return deduped

            return self._recent_conversation_locked(limit)

    def upsert_profile_fact(self, fact: dict[str, Any]) -> None:
        with self.lock:
            self._upsert_fact_locked(fact)

    def get_profile_facts(self) -> list[dict[str, Any]]:
        with self.lock:
            rows = self.conn.execute(
                '''
                SELECT key, value, confidence, updated_at
                FROM facts
                ORDER BY updated_at DESC
                '''
            ).fetchall()
            return [
                {
                    'key': str(row[0] or ''),
                    'value': str(row[1] or ''),
                    'confidence': float(row[2] or 0.0),
                    'updatedAt': self._serialize_time(row[3]),
                }
                for row in rows
            ]

    def get_profile_snapshot(self) -> dict[str, Any]:
        return _build_profile_snapshot(self.get_profile_facts())

    def get_relationship_state(self) -> dict[str, Any]:
        with self.lock:
            turns = self.conn.execute(
                '''
                SELECT id, session_id, role, content, created_at
                FROM turns
                ORDER BY created_at ASC
                '''
            ).fetchall()
            facts = self.conn.execute(
                '''
                SELECT key, value, confidence, updated_at
                FROM facts
                ORDER BY updated_at ASC
                '''
            ).fetchall()
            events = self.conn.execute(
                '''
                SELECT kind, summary, timestamp
                FROM event_summaries
                ORDER BY timestamp ASC
                '''
            ).fetchall()

        turn_payloads = [
            {
                'id': str(row[0] or ''),
                'sessionId': str(row[1] or 'default'),
                'role': str(row[2] or 'user'),
                'content': str(row[3] or ''),
                'createdAt': self._serialize_time(row[4]),
            }
            for row in turns
        ]
        fact_payloads = [
            {
                'key': str(row[0] or ''),
                'value': str(row[1] or ''),
                'confidence': float(row[2] or 0.0),
                'updatedAt': self._serialize_time(row[3]),
            }
            for row in facts
        ]
        event_payloads = [
            {
                'kind': str(row[0] or ''),
                'summary': str(row[1] or ''),
                'timestamp': self._serialize_time(row[2]),
            }
            for row in events
        ]
        return _build_relationship_state(turn_payloads, fact_payloads, event_payloads)

    def get_runtime_status(self) -> dict[str, Any]:
        with self.lock:
            turn_count = int(
                self.conn.execute('SELECT COUNT(*) FROM turns').fetchone()[0] or 0
            )
            fact_count = int(
                self.conn.execute('SELECT COUNT(*) FROM facts').fetchone()[0] or 0
            )
            diary_count = int(
                self.conn.execute('SELECT COUNT(*) FROM diary_entries').fetchone()[0] or 0
            )
            event_count = int(
                self.conn.execute('SELECT COUNT(*) FROM event_summaries').fetchone()[0] or 0
            )
            chunk_count = int(
                self.conn.execute('SELECT COUNT(*) FROM memory_chunks').fetchone()[0] or 0
            )

        return {
            'mode': 'backend',
            'backendAvailable': True,
            'dbEngine': 'duckdb',
            'dbPath': str(self.db_path),
            'vectorIndex': 'lancedb' if self._lance_db is not None else 'disabled',
            'lancedbAvailable': self._lance_db is not None,
            'turnCount': turn_count,
            'factCount': fact_count,
            'diaryCount': diary_count,
            'eventCount': event_count,
            'chunkCount': chunk_count,
            'vectorRowCount': int(self._lance_row_count or 0),
        }

    def append_diary(self, entry: dict[str, Any]) -> None:
        diary_id = str(entry.get('id') or '').strip()
        if not diary_id:
            raise ValueError('Diary entry id is required.')

        with self.lock:
            self.conn.execute(
                '''
                INSERT OR REPLACE INTO diary_entries (
                    id, date, summary, mood, tags_json
                ) VALUES (?, ?, ?, ?, ?)
                ''',
                [
                    diary_id,
                    str(entry.get('date') or ''),
                    _normalize_text(entry.get('summary')),
                    str(entry.get('mood') or ''),
                    json.dumps(entry.get('tags') or [], ensure_ascii=False),
                ],
            )
            self._upsert_chunk_locked(
                chunk_id=f'diary:{diary_id}',
                source_ref=diary_id,
                source='system',
                summary=_normalize_text(entry.get('summary')),
                created_at=str(entry.get('date') or _now_iso()),
                metadata={
                    'kind': 'diary',
                    'mood': str(entry.get('mood') or ''),
                    'tags': entry.get('tags') or [],
                },
            )

    def append_event_summary(self, event: dict[str, Any]) -> None:
        kind = str(event.get('kind') or '').strip() or 'event'
        summary = _normalize_text(event.get('summary'))
        timestamp = str(event.get('timestamp') or _now_iso())
        event_id = hashlib.sha1(f'{kind}|{timestamp}|{summary}'.encode('utf-8')).hexdigest()[:24]

        with self.lock:
            self.conn.execute(
                '''
                INSERT INTO event_summaries (kind, summary, timestamp)
                VALUES (?, ?, ?)
                ''',
                [kind, summary, timestamp],
            )
            self._upsert_chunk_locked(
                chunk_id=f'event:{event_id}',
                source_ref=event_id,
                source='system',
                summary=summary,
                created_at=timestamp,
                metadata={'kind': kind},
            )

    def get_event_summaries(self, limit: int = 20) -> list[dict[str, Any]]:
        limit = max(1, int(limit or 20))
        with self.lock:
            rows = self.conn.execute(
                '''
                SELECT kind, summary, timestamp
                FROM event_summaries
                ORDER BY timestamp DESC
                LIMIT ?
                ''',
                [limit],
            ).fetchall()
            rows.reverse()
            return [
                {
                    'kind': str(row[0] or ''),
                    'summary': str(row[1] or ''),
                    'timestamp': self._serialize_time(row[2]),
                }
                for row in rows
            ]

    def get_conversation(self, session_id: str) -> list[dict[str, Any]]:
        normalized_session_id = str(session_id or 'default').strip() or 'default'
        with self.lock:
            rows = self.conn.execute(
                '''
                SELECT id, session_id, role, content, created_at, metadata_json
                FROM turns
                WHERE session_id = ?
                ORDER BY created_at ASC
                ''',
                [normalized_session_id],
            ).fetchall()
            return [
                {
                    'id': str(row[0] or ''),
                    'sessionId': str(row[1] or normalized_session_id),
                    'role': str(row[2] or 'user'),
                    'content': str(row[3] or ''),
                    'createdAt': self._serialize_time(row[4]),
                    'metadata': self._parse_json(row[5], {}),
                }
                for row in rows
            ]

    def clear_conversation(self, session_id: str) -> None:
        normalized_session_id = str(session_id or 'default').strip() or 'default'
        with self.lock:
            turn_rows = self.conn.execute(
                'SELECT id FROM turns WHERE session_id = ?',
                [normalized_session_id],
            ).fetchall()
            turn_ids = [str(row[0]) for row in turn_rows if row and row[0]]
            self.conn.execute('DELETE FROM turns WHERE session_id = ?', [normalized_session_id])
            if turn_ids:
                placeholders = ', '.join(['?'] * len(turn_ids))
                self.conn.execute(
                    f'DELETE FROM memory_chunks WHERE chunk_id IN ({placeholders})',
                    [f'turn:{turn_id}' for turn_id in turn_ids],
                )
            self._lance_dirty = True

    def _upsert_fact_locked(self, fact: dict[str, Any]) -> None:
        key = str(fact.get('key') or '').strip()
        if not key:
            return
        value = _normalize_fact_value(str(fact.get('value') or ''))
        updated_at = str(fact.get('updatedAt') or _now_iso())
        confidence = float(fact.get('confidence') or 0.0)
        self.conn.execute(
            '''
            INSERT OR REPLACE INTO facts (
                key, value, confidence, updated_at
            ) VALUES (?, ?, ?, ?)
            ''',
            [key, value, confidence, updated_at],
        )
        self._upsert_chunk_locked(
            chunk_id=f'fact:{key}',
            source_ref=key,
            source='profile',
            summary=f'{key}: {value}',
            created_at=updated_at,
            metadata={'confidence': confidence},
        )

    def _upsert_chunk_locked(
        self,
        *,
        chunk_id: str,
        source_ref: str,
        source: str,
        summary: str,
        created_at: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        summary_text = _normalize_text(summary)
        metadata_json = json.dumps(metadata or {}, ensure_ascii=False)
        vector_json = json.dumps(_embed_text(summary_text))
        self.conn.execute(
            '''
            INSERT OR REPLACE INTO memory_chunks (
                chunk_id, source_ref, source, summary, created_at, metadata_json, vector_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ''',
            [
                chunk_id,
                source_ref,
                source,
                summary_text,
                created_at,
                metadata_json,
                vector_json,
            ],
        )
        self._lance_dirty = True

    def _recent_conversation_locked(self, limit: int) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            '''
            SELECT id, content, created_at, metadata_json
            FROM turns
            ORDER BY created_at DESC
            LIMIT ?
            ''',
            [limit],
        ).fetchall()
        return [
            {
                'id': str(row[0] or ''),
                'summary': str(row[1] or ''),
                'source': 'conversation',
                'createdAt': self._serialize_time(row[2]),
                'score': round(max(0.1, 1.0 - index * 0.1), 4),
                'metadata': self._parse_json(row[3], {}),
            }
            for index, row in enumerate(rows)
        ]

    def _parse_json(self, raw: Any, default: Any) -> Any:
        if raw is None or raw == '':
            return default
        if isinstance(raw, (dict, list)):
            return raw
        try:
            return json.loads(str(raw))
        except Exception:
            return default

    def _parse_vector_json(self, raw: Any) -> list[float]:
        value = self._parse_json(raw, [])
        if not isinstance(value, list):
            return []
        vector: list[float] = []
        for item in value:
            if isinstance(item, (int, float)):
                vector.append(float(item))
        return vector

    def _serialize_time(self, value: Any) -> str:
        if isinstance(value, datetime):
            return value.isoformat(timespec='seconds')
        return str(value or '')

    def _search_lance_locked(self, query_text: str, limit: int) -> dict[str, float]:
        if not self._lance_db or not query_text:
            return {}

        self._sync_lance_locked()
        if not self._lance_table or self._lance_row_count <= 0:
            return {}

        try:
            results = self._lance_table.search(_embed_text(query_text)).limit(limit).to_list()
        except Exception:
            return {}

        scored: dict[str, float] = {}
        for item in results:
            if not isinstance(item, dict):
                continue
            chunk_id = str(item.get('chunk_id') or '')
            if not chunk_id:
                continue
            distance = item.get('_distance')
            if isinstance(distance, (int, float)) and math.isfinite(float(distance)):
                score = 1.0 / (1.0 + max(0.0, float(distance)))
            else:
                score = 0.0
            if score > 0:
                scored[chunk_id] = max(scored.get(chunk_id, 0.0), score)
        return scored

    def _sync_lance_locked(self) -> None:
        if not self._lance_db or not self._lance_dirty:
            return

        rows = self.conn.execute(
            '''
            SELECT chunk_id, source_ref, source, summary, created_at, metadata_json, vector_json
            FROM memory_chunks
            ORDER BY created_at ASC
            '''
        ).fetchall()
        self._lance_row_count = len(rows)
        if not rows:
            self._lance_table = None
            self._lance_dirty = False
            return

        data = [
            {
                'chunk_id': str(row[0] or ''),
                'source_ref': str(row[1] or ''),
                'source': str(row[2] or 'system'),
                'summary': str(row[3] or ''),
                'created_at': self._serialize_time(row[4]),
                'metadata_json': str(row[5] or '{}'),
                'vector': self._parse_vector_json(row[6]),
            }
            for row in rows
        ]

        try:
            if self._lance_table is None:
                self._lance_table = self._lance_db.create_table(
                    'memory_chunks',
                    data=data,
                    mode='overwrite',
                )
            else:
                self._lance_table.add(data, mode='overwrite')
        except Exception:
            try:
                self._lance_table = self._lance_db.create_table(
                    'memory_chunks',
                    data=data,
                    mode='overwrite',
                )
            except Exception:
                self._lance_table = None
        finally:
            self._lance_dirty = False


def create_memory_service(config: dict[str, Any] | None = None) -> MemoryService:
    return MemoryService(config)
