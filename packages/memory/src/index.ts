import type { EmbeddingVector } from '@table-pet/shared';

const DEFAULT_MEMORY_STORAGE_KEY = 'table-pet-memory';

export interface ChatTurn {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryChunk {
  id: string;
  summary: string;
  source: 'conversation' | 'profile' | 'screen' | 'plugin' | 'system';
  createdAt: string;
  score?: number;
  embedding?: EmbeddingVector;
  metadata?: Record<string, unknown>;
}

export interface UserFact {
  key: string;
  value: string;
  confidence: number;
  updatedAt: string;
}

export type RelationshipLevel = 'new' | 'warming' | 'close' | 'trusted';
export type CompanionMoodState = 'idle' | 'happy' | 'focused' | 'sleepy' | 'excited';

export interface UserProfileSnapshot {
  name?: string;
  likes: string[];
  dislikes: string[];
  habits: string[];
  reminders: UserFact[];
  facts: UserFact[];
}

export interface RelationshipState {
  affection: number;
  level: RelationshipLevel;
  mood: CompanionMoodState;
  userTurns: number;
  assistantTurns: number;
  profileFactCount: number;
  reminderCount: number;
  lastInteractionAt: string | null;
}

export interface DiaryEntry {
  id: string;
  date: string;
  summary: string;
  mood?: string;
  tags?: string[];
}

export interface EventSummary {
  kind: string;
  summary: string;
  timestamp: string;
}

export interface BackendMemoryRuntimeStatus {
  mode: 'backend' | 'fallback';
  backendAvailable: boolean;
  dbEngine: string;
  dbPath?: string;
  vectorIndex?: string;
  lancedbAvailable?: boolean;
  turnCount?: number;
  factCount?: number;
  diaryCount?: number;
  eventCount?: number;
  chunkCount?: number;
  vectorRowCount?: number;
  error?: string;
}

export interface MemorySearchOptions {
  limit?: number;
  minScore?: number;
}

export interface MemoryService {
  saveMessage(turn: ChatTurn): Promise<void>;
  searchRelevant(query: string, options?: MemorySearchOptions): Promise<MemoryChunk[]>;
  upsertProfileFact(fact: UserFact): Promise<void>;
  getProfileFacts(): Promise<UserFact[]>;
  getProfileSnapshot(): Promise<UserProfileSnapshot>;
  getRelationshipState(): Promise<RelationshipState>;
  appendDiary(entry: DiaryEntry): Promise<void>;
  appendEventSummary(event: EventSummary): Promise<void>;
  getEventSummaries(limit?: number): Promise<EventSummary[]>;
  getConversation(sessionId: string): Promise<ChatTurn[]>;
  clearConversation(sessionId: string): Promise<void>;
}

interface SerializedMemoryState {
  turns: ChatTurn[];
  facts: UserFact[];
  diary: DiaryEntry[];
  events: EventSummary[];
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizeReminderDate(rawText: string, now = new Date()): string | null {
  const normalized = String(rawText || '').trim();
  if (!normalized) {
    return null;
  }

  const fullDateMatch = normalized.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (fullDateMatch) {
    const year = Number(fullDateMatch[1]);
    const month = Number(fullDateMatch[2]);
    const day = Number(fullDateMatch[3]);
    return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
  }

  const chineseMonthDayMatch = normalized.match(/(\d{1,2})月(\d{1,2})(?:日|号)?/);
  if (chineseMonthDayMatch) {
    const month = Number(chineseMonthDayMatch[1]);
    const day = Number(chineseMonthDayMatch[2]);
    return `${now.getFullYear()}-${padDatePart(month)}-${padDatePart(day)}`;
  }

  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (normalized.includes('后天')) {
    baseDate.setDate(baseDate.getDate() + 2);
    return baseDate.toISOString().slice(0, 10);
  }

  if (normalized.includes('明天')) {
    baseDate.setDate(baseDate.getDate() + 1);
    return baseDate.toISOString().slice(0, 10);
  }

  if (normalized.includes('今天')) {
    return baseDate.toISOString().slice(0, 10);
  }

  return null;
}

function extractReminderFactsFromTurn(turn: ChatTurn): UserFact[] {
  if (turn.role !== 'user') {
    return [];
  }

  const normalized = String(turn.content || '').trim();
  if (!normalized) {
    return [];
  }

  const reminderDate = normalizeReminderDate(normalized);
  if (!reminderDate) {
    return [];
  }

  const reminderKeywords = [
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
  ];
  const lowered = normalized.toLowerCase();
  const includesReminderKeyword = reminderKeywords.some((keyword) =>
    lowered.includes(keyword.toLowerCase()),
  );
  if (!includesReminderKeyword) {
    return [];
  }

  const slug = normalized
    .slice(0, 24)
    .replace(/[^\w\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return [
    {
      key: `reminder:${reminderDate}:${slug || 'event'}`,
      value: normalized,
      confidence: 0.82,
      updatedAt: turn.createdAt,
    },
  ];
}

function normalizeFactValue(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugifyFactValue(value: string): string {
  return normalizeFactValue(value)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildProfileFact(
  prefix: string,
  value: string,
  updatedAt: string,
  confidence: number,
): UserFact | null {
  const normalizedValue = normalizeFactValue(value);
  const slug = slugifyFactValue(normalizedValue);
  if (!normalizedValue || !slug) {
    return null;
  }

  return {
    key: `${prefix}:${slug}`,
    value: normalizedValue,
    confidence,
    updatedAt,
  };
}

function extractProfileFactsFromTurn(turn: ChatTurn): UserFact[] {
  if (turn.role !== 'user') {
    return [];
  }

  const text = normalizeFactValue(turn.content);
  if (!text) {
    return [];
  }

  const facts: UserFact[] = [];
  const patterns: Array<{
    prefix: string;
    confidence: number;
    expressions: RegExp[];
  }> = [
    {
      prefix: 'identity:name',
      confidence: 0.93,
      expressions: [
        /\bmy name is\s+([^.!?,\n]+)/i,
        /\bi am\s+called\s+([^.!?,\n]+)/i,
        /(?:^|[，。！？!?\s])我叫([^，。！？!?\n]+)/,
        /(?:^|[，。！？!?\s])我是([^，。！？!?\n]{1,24})/,
      ],
    },
    {
      prefix: 'preference:like',
      confidence: 0.78,
      expressions: [
        /\b(?:i|we)\s+(?:really\s+)?(?:like|love|enjoy|prefer)\s+([^.!?,\n]+)/i,
        /(?:^|[，。！？!?\s])我(?:很)?(?:喜欢|爱|偏爱)([^，。！？!?\n]+)/,
      ],
    },
    {
      prefix: 'preference:dislike',
      confidence: 0.8,
      expressions: [
        /\b(?:i|we)\s+(?:really\s+)?(?:dislike|hate|do not like|don't like)\s+([^.!?,\n]+)/i,
        /(?:^|[，。！？!?\s])我(?:不喜欢|讨厌|不爱)([^，。！？!?\n]+)/,
      ],
    },
    {
      prefix: 'habit',
      confidence: 0.72,
      expressions: [
        /\b(?:i|we)\s+(?:usually|often|always|tend to)\s+([^.!?,\n]+)/i,
        /(?:^|[，。！？!?\s])我(?:经常|通常|一般|习惯)([^，。！？!?\n]+)/,
      ],
    },
  ];

  for (const rule of patterns) {
    for (const expression of rule.expressions) {
      const match = text.match(expression);
      const value = match?.[1];
      if (!value) {
        continue;
      }

      const fact = buildProfileFact(rule.prefix, value, turn.createdAt, rule.confidence);
      if (fact) {
        facts.push(fact);
      }
      break;
    }
  }

  return facts;
}

function extractFactsFromTurn(turn: ChatTurn): UserFact[] {
  const factsByKey = new Map<string, UserFact>();
  for (const fact of [
    ...extractReminderFactsFromTurn(turn),
    ...extractProfileFactsFromTurn(turn),
  ]) {
    factsByKey.set(fact.key, fact);
  }
  return Array.from(factsByKey.values());
}

function collectFactValues(facts: UserFact[], prefix: string): string[] {
  const values = new Set<string>();
  for (const fact of facts) {
    if (fact.key.startsWith(prefix) && fact.value) {
      values.add(fact.value);
    }
  }
  return Array.from(values.values());
}

function buildProfileSnapshot(facts: UserFact[]): UserProfileSnapshot {
  const nameFact = facts.find((fact) => fact.key.startsWith('identity:name:'));
  const reminders = facts.filter((fact) => fact.key.startsWith('reminder:'));
  return {
    name: nameFact?.value,
    likes: collectFactValues(facts, 'preference:like:'),
    dislikes: collectFactValues(facts, 'preference:dislike:'),
    habits: collectFactValues(facts, 'habit:'),
    reminders,
    facts: [...facts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

function buildRelationshipState(
  turns: ChatTurn[],
  facts: UserFact[],
  events: EventSummary[],
): RelationshipState {
  const userTurns = turns.filter((turn) => turn.role === 'user').length;
  const assistantTurns = turns.filter((turn) => turn.role === 'assistant').length;
  const reminderCount = facts.filter((fact) => fact.key.startsWith('reminder:')).length;
  const profileFactCount = facts.length - reminderCount;
  const affection = Math.min(
    100,
    userTurns * 4 + assistantTurns * 2 + Math.min(profileFactCount, 10) * 5 + Math.min(events.length, 20),
  );

  let level: RelationshipLevel = 'new';
  if (affection >= 70) {
    level = 'trusted';
  } else if (affection >= 45) {
    level = 'close';
  } else if (affection >= 20) {
    level = 'warming';
  }

  const lastInteractionAt = turns.length > 0 ? turns[turns.length - 1]?.createdAt ?? null : null;
  const recentEventKinds = events.slice(-6).map((event) => event.kind);
  const currentHour = new Date().getHours();

  let mood: CompanionMoodState = 'idle';
  if (currentHour >= 23 || currentHour <= 5) {
    mood = 'sleepy';
  } else if (
    recentEventKinds.some((kind) => kind.includes('clipboard-code') || kind.includes('clipboard-error'))
  ) {
    mood = 'focused';
  } else if (recentEventKinds.some((kind) => kind.includes('pomodoro-complete'))) {
    mood = 'excited';
  } else if (affection >= 70) {
    mood = 'happy';
  }

  return {
    affection,
    level,
    mood,
    userTurns,
    assistantTurns,
    profileFactCount: Math.max(0, profileFactCount),
    reminderCount,
    lastInteractionAt,
  };
}

function createEmptyMemoryState(): SerializedMemoryState {
  return {
    turns: [],
    facts: [],
    diary: [],
    events: [],
  };
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function parseStoredMemory(raw: string | null): SerializedMemoryState {
  if (!raw) {
    return createEmptyMemoryState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SerializedMemoryState>;
    return {
      turns: Array.isArray(parsed.turns) ? parsed.turns : [],
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      diary: Array.isArray(parsed.diary) ? parsed.diary : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return createEmptyMemoryState();
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter(Boolean);
}

function scoreTextMatch(query: string, candidate: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return 0;
  }

  const normalizedCandidate = candidate.toLowerCase();
  const hits = queryTokens.filter((token) => normalizedCandidate.includes(token)).length;
  return hits / queryTokens.length;
}

export class InMemoryMemoryService implements MemoryService {
  private readonly turns: ChatTurn[] = [];
  private readonly facts = new Map<string, UserFact>();
  private readonly diary: DiaryEntry[] = [];
  private readonly events: EventSummary[] = [];

  async saveMessage(turn: ChatTurn): Promise<void> {
    this.turns.push(turn);
    for (const fact of extractFactsFromTurn(turn)) {
      this.facts.set(fact.key, fact);
    }
  }

  async searchRelevant(
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<MemoryChunk[]> {
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.2;
    const conversationMatches = [...this.turns]
      .reverse()
      .map((turn) => ({
        turn,
        score: scoreTextMatch(query, turn.content),
      }))
      .filter((item) => item.score >= minScore)
      .slice(0, limit)
      .map<MemoryChunk>(({ turn, score }) => ({
        id: turn.id,
        summary: turn.content,
        source: 'conversation',
        createdAt: turn.createdAt,
        score,
        metadata: turn.metadata,
      }));

    const factMatches = Array.from(this.facts.values())
      .map((fact) => ({
        fact,
        score: Math.max(fact.confidence, scoreTextMatch(query, `${fact.key} ${fact.value}`)),
      }))
      .filter((item) => item.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map<MemoryChunk>(({ fact, score }) => ({
        id: fact.key,
        summary: `${fact.key}: ${fact.value}`,
        source: 'profile',
        createdAt: fact.updatedAt,
        score,
      }));

    const matches = [...conversationMatches, ...factMatches]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, limit);

    if (matches.length > 0) {
      return matches;
    }

    return this.turns
      .slice(-limit)
      .reverse()
      .map<MemoryChunk>((turn, index) => ({
        id: turn.id,
        summary: turn.content,
        source: 'conversation',
        createdAt: turn.createdAt,
        score: 1 - index * 0.1,
        metadata: turn.metadata,
      }));
  }

  async upsertProfileFact(fact: UserFact): Promise<void> {
    this.facts.set(fact.key, fact);
  }

  async getProfileFacts(): Promise<UserFact[]> {
    return Array.from(this.facts.values());
  }

  async getProfileSnapshot(): Promise<UserProfileSnapshot> {
    return buildProfileSnapshot(Array.from(this.facts.values()));
  }

  async getRelationshipState(): Promise<RelationshipState> {
    return buildRelationshipState(
      this.turns,
      Array.from(this.facts.values()),
      this.events,
    );
  }

  async appendDiary(entry: DiaryEntry): Promise<void> {
    this.diary.push(entry);
  }

  async appendEventSummary(event: EventSummary): Promise<void> {
    this.events.push(event);
  }

  async getEventSummaries(limit = 20): Promise<EventSummary[]> {
    return this.events.slice(-Math.max(1, limit));
  }

  async getConversation(sessionId: string): Promise<ChatTurn[]> {
    return this.turns.filter((turn) => turn.sessionId === sessionId);
  }

  async clearConversation(sessionId: string): Promise<void> {
    const remainingTurns = this.turns.filter((turn) => turn.sessionId !== sessionId);
    this.turns.length = 0;
    this.turns.push(...remainingTurns);
  }
}

export class PersistentMemoryService implements MemoryService {
  private state = createEmptyMemoryState();
  private readonly fallback = new InMemoryMemoryService();

  constructor(private readonly storageKey = DEFAULT_MEMORY_STORAGE_KEY) {
    this.state = parseStoredMemory(getStorage()?.getItem(this.storageKey) ?? null);
  }

  async saveMessage(turn: ChatTurn): Promise<void> {
    this.state.turns.push(turn);
    if (turn.role === 'user') {
      const factsByKey = new Map(this.state.facts.map((item) => [item.key, item]));
      for (const fact of extractFactsFromTurn(turn)) {
        factsByKey.set(fact.key, fact);
      }
      this.state.facts = Array.from(factsByKey.values());
    }
    this.persist();
    await this.fallback.saveMessage(turn);
  }

  async searchRelevant(
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<MemoryChunk[]> {
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.2;

    const conversationMatches = [...this.state.turns]
      .reverse()
      .map((turn) => ({
        turn,
        score: scoreTextMatch(query, turn.content),
      }))
      .filter((item) => item.score >= minScore)
      .slice(0, limit)
      .map<MemoryChunk>(({ turn, score }) => ({
        id: turn.id,
        summary: turn.content,
        source: 'conversation',
        createdAt: turn.createdAt,
        score,
        metadata: turn.metadata,
      }));

    const factMatches = this.state.facts
      .map((fact) => ({
        fact,
        score: Math.max(fact.confidence, scoreTextMatch(query, `${fact.key} ${fact.value}`)),
      }))
      .filter((item) => item.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map<MemoryChunk>((fact) => ({
        id: fact.fact.key,
        summary: `${fact.fact.key}: ${fact.fact.value}`,
        source: 'profile',
        createdAt: fact.fact.updatedAt,
        score: fact.score,
      }));

    const matches = [...conversationMatches, ...factMatches]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, limit);

    if (matches.length > 0) {
      return matches;
    }

    return this.state.turns
      .slice(-limit)
      .reverse()
      .map<MemoryChunk>((turn, index) => ({
        id: turn.id,
        summary: turn.content,
        source: 'conversation',
        createdAt: turn.createdAt,
        score: 1 - index * 0.1,
        metadata: turn.metadata,
      }));
  }

  async upsertProfileFact(fact: UserFact): Promise<void> {
    const nextFacts = new Map(this.state.facts.map((item) => [item.key, item]));
    nextFacts.set(fact.key, fact);
    this.state.facts = Array.from(nextFacts.values());
    this.persist();
    await this.fallback.upsertProfileFact(fact);
  }

  async getProfileFacts(): Promise<UserFact[]> {
    return [...this.state.facts];
  }

  async getProfileSnapshot(): Promise<UserProfileSnapshot> {
    return buildProfileSnapshot(this.state.facts);
  }

  async getRelationshipState(): Promise<RelationshipState> {
    return buildRelationshipState(this.state.turns, this.state.facts, this.state.events);
  }

  async appendDiary(entry: DiaryEntry): Promise<void> {
    this.state.diary.push(entry);
    this.persist();
    await this.fallback.appendDiary(entry);
  }

  async appendEventSummary(event: EventSummary): Promise<void> {
    this.state.events.push(event);
    this.persist();
    await this.fallback.appendEventSummary(event);
  }

  async getEventSummaries(limit = 20): Promise<EventSummary[]> {
    return this.state.events.slice(-Math.max(1, limit));
  }

  async getConversation(sessionId: string): Promise<ChatTurn[]> {
    return this.state.turns.filter((turn) => turn.sessionId === sessionId);
  }

  async clearConversation(sessionId: string): Promise<void> {
    this.state.turns = this.state.turns.filter((turn) => turn.sessionId !== sessionId);
    this.persist();
    await this.fallback.clearConversation(sessionId);
  }

  private persist(): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    storage.setItem(this.storageKey, JSON.stringify(this.state));
  }
}

interface MemoryBackendResponse {
  type: string;
  requestId?: string;
  action?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
}

interface PendingMemoryRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

function defaultBackendUrl(): string {
  return 'ws://127.0.0.1:8766';
}

class DesktopPetWebSocketMemoryClient {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pendingRequests = new Map<string, PendingMemoryRequest>();

  constructor(private url = defaultBackendUrl()) {}

  setUrl(url: string): void {
    const nextUrl = url.trim() || defaultBackendUrl();
    if (nextUrl === this.url) {
      return;
    }

    this.url = nextUrl;
    this.disconnect();
  }

  private disconnect(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore close failures
      }
    }
    this.socket = null;
    this.connectPromise = null;
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let opened = false;
      const socket = new WebSocket(this.url);
      this.socket = socket;

      socket.onopen = () => {
        opened = true;
        this.connectPromise = null;
        resolve();
      };

      socket.onmessage = (event) => {
        this.handleMessage(String(event.data ?? ''));
      };

      socket.onerror = () => {
        if (!opened) {
          this.connectPromise = null;
          reject(new Error('Memory websocket connection failed.'));
        }
      };

      socket.onclose = () => {
        const pending = Array.from(this.pendingRequests.values());
        this.pendingRequests.clear();
        this.socket = null;
        this.connectPromise = null;

        for (const request of pending) {
          request.reject(new Error('Memory websocket connection closed.'));
        }

        if (!opened) {
          reject(new Error('Memory websocket connection closed before it was ready.'));
        }
      };
    });

    return this.connectPromise;
  }

  async request<TResult>(
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<TResult> {
    await this.connect();

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Memory websocket is not connected.');
    }

    const requestId = crypto.randomUUID();
    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: (value) => resolve(value as TResult),
        reject,
      });

      this.socket?.send(
        JSON.stringify({
          type: 'memory_request',
          requestId,
          action,
          payload,
        }),
      );
    });
  }

  private handleMessage(raw: string): void {
    let data: MemoryBackendResponse;

    try {
      data = JSON.parse(raw) as MemoryBackendResponse;
    } catch {
      return;
    }

    if (data.type !== 'memory_response' || typeof data.requestId !== 'string') {
      return;
    }

    const pending = this.pendingRequests.get(data.requestId);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(data.requestId);
    if (data.ok === false) {
      pending.reject(new Error(data.error || `Memory action ${data.action || ''} failed.`));
      return;
    }

    pending.resolve(data.result);
  }
}

export class BackendMemoryService implements MemoryService {
  private readonly client: DesktopPetWebSocketMemoryClient;

  constructor(
    private readonly getBackendUrl: () => string = defaultBackendUrl,
    private readonly fallback: MemoryService = new PersistentMemoryService(),
  ) {
    this.client = new DesktopPetWebSocketMemoryClient(this.getBackendUrl());
  }

  private refreshBackendUrl(): void {
    this.client.setUrl(this.getBackendUrl());
  }

  private async request<TResult>(
    action: string,
    payload: Record<string, unknown>,
    onFallback: () => Promise<TResult>,
  ): Promise<TResult> {
    this.refreshBackendUrl();
    try {
      return await this.client.request<TResult>(action, payload);
    } catch {
      return onFallback();
    }
  }

  async saveMessage(turn: ChatTurn): Promise<void> {
    await this.fallback.saveMessage(turn);
    this.refreshBackendUrl();
    try {
      await this.client.request<void>('saveMessage', { turn });
    } catch {
      // Keep the mirrored local fallback as the safety net.
    }
  }

  async searchRelevant(
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<MemoryChunk[]> {
    return this.request<MemoryChunk[]>(
      'searchRelevant',
      { query, options },
      () => this.fallback.searchRelevant(query, options),
    );
  }

  async upsertProfileFact(fact: UserFact): Promise<void> {
    await this.fallback.upsertProfileFact(fact);
    this.refreshBackendUrl();
    try {
      await this.client.request<void>('upsertProfileFact', { fact });
    } catch {
      // Keep the mirrored local fallback as the safety net.
    }
  }

  async getProfileFacts(): Promise<UserFact[]> {
    return this.request<UserFact[]>(
      'getProfileFacts',
      {},
      () => this.fallback.getProfileFacts(),
    );
  }

  async getProfileSnapshot(): Promise<UserProfileSnapshot> {
    return this.request<UserProfileSnapshot>(
      'getProfileSnapshot',
      {},
      () => this.fallback.getProfileSnapshot(),
    );
  }

  async getRelationshipState(): Promise<RelationshipState> {
    return this.request<RelationshipState>(
      'getRelationshipState',
      {},
      () => this.fallback.getRelationshipState(),
    );
  }

  async appendDiary(entry: DiaryEntry): Promise<void> {
    await this.fallback.appendDiary(entry);
    this.refreshBackendUrl();
    try {
      await this.client.request<void>('appendDiary', { entry });
    } catch {
      // Keep the mirrored local fallback as the safety net.
    }
  }

  async appendEventSummary(event: EventSummary): Promise<void> {
    await this.fallback.appendEventSummary(event);
    this.refreshBackendUrl();
    try {
      await this.client.request<void>('appendEventSummary', { event });
    } catch {
      // Keep the mirrored local fallback as the safety net.
    }
  }

  async getEventSummaries(limit = 20): Promise<EventSummary[]> {
    return this.request<EventSummary[]>(
      'getEventSummaries',
      { limit },
      () => this.fallback.getEventSummaries(limit),
    );
  }

  async getConversation(sessionId: string): Promise<ChatTurn[]> {
    return this.request<ChatTurn[]>(
      'getConversation',
      { sessionId },
      () => this.fallback.getConversation(sessionId),
    );
  }

  async clearConversation(sessionId: string): Promise<void> {
    await this.fallback.clearConversation(sessionId);
    this.refreshBackendUrl();
    try {
      await this.client.request<void>('clearConversation', { sessionId });
    } catch {
      // Keep the mirrored local fallback as the safety net.
    }
  }

  async getRuntimeStatus(): Promise<BackendMemoryRuntimeStatus> {
    this.refreshBackendUrl();
    try {
      return await this.client.request<BackendMemoryRuntimeStatus>('getRuntimeStatus', {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Memory backend unavailable.';
      return {
        mode: 'fallback',
        backendAvailable: false,
        dbEngine: 'local-storage',
        vectorIndex: 'disabled',
        lancedbAvailable: false,
        error: message,
      };
    }
  }
}
