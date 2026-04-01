import type { CharacterEngine } from '@table-pet/character';
import type {
  ChatTurn,
  MemorySearchOptions,
  MemoryService,
} from '@table-pet/memory';
import type { ToolRegistry } from '@table-pet/plugins';
import type { PolicyEngine } from '@table-pet/policy';
import type {
  ChatDelta,
  ChatRequest,
  ProviderRegistry,
} from '@table-pet/providers';
import type { CompanionEvent, ChatMessage } from '@table-pet/shared';
import type { StageController, StageMood } from '@table-pet/stage';

export interface AssistantReply {
  text: string;
  mood?: StageMood;
  expression?: string;
  motion?: string;
  metadata?: Record<string, unknown>;
}

export interface UserTextInput {
  text: string;
  sessionId?: string;
  source?: 'chat' | 'clipboard' | 'ocr' | 'voice';
  memoryOptions?: MemorySearchOptions;
  metadata?: Record<string, unknown>;
  onAssistantDelta?: (delta: ChatDelta) => void;
}

export interface CoreContext {
  memory: MemoryService;
  providers: ProviderRegistry;
  policy: PolicyEngine;
  plugins: ToolRegistry;
  character: CharacterEngine;
  stage: StageController;
}

export interface CoreService {
  dispatch(event: CompanionEvent): Promise<void>;
  sendText(input: UserTextInput): Promise<AssistantReply>;
  interrupt(reason: 'user_speaking' | 'manual' | 'system'): Promise<void>;
  tick(now: number): Promise<void>;
}

export interface CoreEventHandler {
  canHandle(event: CompanionEvent): boolean;
  handle(event: CompanionEvent, context: CoreContext): Promise<void>;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizeReminderDate(rawText: string, now = new Date()): string | null {
  const fullDateMatch = rawText.match(
    /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
  );
  if (fullDateMatch) {
    const year = Number(fullDateMatch[1]);
    const month = Number(fullDateMatch[2]);
    const day = Number(fullDateMatch[3]);
    return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
  }

  const monthDayMatch = rawText.match(/(\d{1,2})月(\d{1,2})(?:日|号)?/);
  if (monthDayMatch) {
    const month = Number(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);
    return `${now.getFullYear()}-${padDatePart(month)}-${padDatePart(day)}`;
  }

  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rawText.includes('后天')) {
    baseDate.setDate(baseDate.getDate() + 2);
    return baseDate.toISOString().slice(0, 10);
  }

  if (rawText.includes('明天')) {
    baseDate.setDate(baseDate.getDate() + 1);
    return baseDate.toISOString().slice(0, 10);
  }

  if (rawText.includes('今天')) {
    return baseDate.toISOString().slice(0, 10);
  }

  return null;
}

function extractReminderFacts(rawText: string): Array<{ key: string; value: string }> {
  const normalized = rawText.trim();
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
    'deadline',
    'ddl',
    '答辩',
    '出发',
    '生日',
    '提交',
    '截止',
  ];
  const includesReminderKeyword = reminderKeywords.some((keyword) =>
    normalized.toLowerCase().includes(keyword.toLowerCase()),
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
    },
  ];
}

export class CompanionCore implements CoreService {
  private readonly handlers: CoreEventHandler[] = [];

  constructor(private readonly context: CoreContext) {}

  registerHandler(handler: CoreEventHandler): void {
    this.handlers.push(handler);
  }

  async dispatch(event: CompanionEvent): Promise<void> {
    for (const handler of this.handlers) {
      if (handler.canHandle(event)) {
        await handler.handle(event, this.context);
      }
    }
  }

  async sendText(input: UserTextInput): Promise<AssistantReply> {
    const sessionId = input.sessionId ?? 'default';
    const profile = await this.context.character.getActiveProfile();
    const [
      fullConversation,
      memory,
      profileSnapshot,
      relationship,
      recentEvents,
    ] = await Promise.all([
      this.context.memory.getConversation(sessionId),
      this.context.memory.searchRelevant(input.text, input.memoryOptions),
      this.context.memory.getProfileSnapshot(),
      this.context.memory.getRelationshipState(),
      this.context.memory.getEventSummaries(6),
    ]);
    const recentConversation = fullConversation.slice(-8);
    const recentConversationIds = new Set(recentConversation.map((turn) => turn.id));
    const filteredMemory = memory.filter(
      (item) =>
        item.source !== 'conversation' || !recentConversationIds.has(item.id),
    );

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: await this.context.character.buildSystemPrompt({
          profile,
          memory: filteredMemory,
          latestUserText: input.text,
          profileSnapshot,
          relationship,
          recentEvents,
        }),
      },
      ...recentConversation.map<ChatMessage>((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      {
        role: 'user',
        content: input.text,
      },
    ];

    const request: ChatRequest = {
      sessionId,
      messages,
      metadata: {
        source: input.source ?? 'chat',
        ...input.metadata,
      },
      onDelta: input.onAssistantDelta,
    };

    await this.context.memory.saveMessage(
      this.toChatTurn('user', input.text, sessionId),
    );

    const reminderFacts = extractReminderFacts(input.text);
    for (const fact of reminderFacts) {
      await this.context.memory.upsertProfileFact({
        key: fact.key,
        value: fact.value,
        confidence: 0.82,
        updatedAt: new Date().toISOString(),
      });
    }

    const chatProvider = this.context.providers.getChatProvider();
    if (!chatProvider) {
      const fallbackReply = {
        text: 'Chat provider is not configured yet.',
        mood: 'idle' as const,
      };
      await this.context.memory.saveMessage(
        this.toChatTurn('assistant', fallbackReply.text, sessionId),
      );
      return fallbackReply;
    }

    const response = await chatProvider.generate(request);
    const reply: AssistantReply = {
      text: response.text,
      mood: 'focused',
      metadata: response.metadata,
    };

    if (reply.mood) {
      await this.context.stage.setMood(reply.mood);
    }
    if (reply.expression) {
      await this.context.stage.setExpression(reply.expression);
    }
    if (reply.motion) {
      await this.context.stage.playMotion(reply.motion);
    }

    await this.context.memory.saveMessage(
      this.toChatTurn('assistant', reply.text, sessionId, reply.metadata),
    );

    return reply;
  }

  async interrupt(reason: 'user_speaking' | 'manual' | 'system'): Promise<void> {
    await this.context.stage.setMood('idle');
    await this.context.memory.appendEventSummary({
      kind: 'interrupt',
      summary: `Core interrupted because of ${reason}.`,
      timestamp: new Date().toISOString(),
    });
  }

  async tick(now: number): Promise<void> {
    await this.context.memory.appendEventSummary({
      kind: 'heartbeat',
      summary: `Core heartbeat at ${new Date(now).toISOString()}.`,
      timestamp: new Date(now).toISOString(),
    });
  }

  private toChatTurn(
    role: ChatTurn['role'],
    content: string,
    sessionId?: string,
    metadata?: Record<string, unknown>,
  ): ChatTurn {
    return {
      id: crypto.randomUUID(),
      sessionId: sessionId ?? 'default',
      role,
      content,
      createdAt: new Date().toISOString(),
      metadata,
    };
  }
}
