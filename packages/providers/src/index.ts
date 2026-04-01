import type {
  ChatMessage,
  EmbeddingVector,
  SearchResult,
} from '@table-pet/shared';

export interface ChatRequest {
  sessionId?: string;
  messages: ChatMessage[];
  temperature?: number;
  metadata?: Record<string, unknown>;
  onDelta?: (delta: ChatDelta) => void;
}

export interface ChatResponse {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ChatDelta {
  delta: string;
  fullText?: string;
  done?: boolean;
}

export interface AudioChunk {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
}

export interface AudioBufferRef {
  mimeType: string;
  data: Uint8Array;
  durationMs?: number;
}

export interface Transcription {
  text: string;
  confidence?: number;
  language?: string;
}

export interface TtsRequest {
  text: string;
  voice?: string;
  style?: string;
  rate?: number;
}

export interface SearchRequest {
  query: string;
  limit?: number;
}

export interface OcrResult {
  text: string;
  blocks?: Array<{
    text: string;
    confidence?: number;
  }>;
}

export interface ChatProvider {
  generate(request: ChatRequest): Promise<ChatResponse>;
  stream?(request: ChatRequest): AsyncIterable<ChatDelta>;
}

export interface SttProvider {
  transcribe(input: AudioChunk | Blob): Promise<Transcription>;
}

export interface TtsProvider {
  synthesize(request: TtsRequest): Promise<AudioBufferRef>;
  stream?(request: TtsRequest): AsyncIterable<AudioChunk>;
}

export interface SearchProvider {
  search(request: SearchRequest): Promise<SearchResult[]>;
}

export interface OcrProvider {
  recognize(image: Blob | Uint8Array): Promise<OcrResult>;
}

export interface EmbeddingProvider {
  encode(text: string): Promise<EmbeddingVector>;
}

export class ProviderRegistry {
  constructor(
    private readonly providers: {
      chat?: ChatProvider;
      stt?: SttProvider;
      tts?: TtsProvider;
      search?: SearchProvider;
      ocr?: OcrProvider;
      embedding?: EmbeddingProvider;
    } = {},
  ) {}

  getChatProvider(): ChatProvider | undefined {
    return this.providers.chat;
  }

  getSttProvider(): SttProvider | undefined {
    return this.providers.stt;
  }

  getTtsProvider(): TtsProvider | undefined {
    return this.providers.tts;
  }

  getSearchProvider(): SearchProvider | undefined {
    return this.providers.search;
  }

  getOcrProvider(): OcrProvider | undefined {
    return this.providers.ocr;
  }

  getEmbeddingProvider(): EmbeddingProvider | undefined {
    return this.providers.embedding;
  }
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface WebSocketChatSnapshot {
  url: string;
  connectionState: ConnectionState;
  errorMessage: string;
  isStreaming: boolean;
}

export interface WebSocketChatHooks {
  onStart?: () => void;
  onDelta?: (delta: ChatDelta) => void;
  onComplete?: (fullText: string) => void;
}

export interface WebSocketChatRequestOptions {
  metadata?: Record<string, unknown>;
  providerConfig?: Record<string, unknown>;
  sessionId?: string;
}

interface PendingChatRequest {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  fullText: string;
  hooks?: WebSocketChatHooks;
}

export class DesktopPetWebSocketChatClient {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private manuallyDisconnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequest: PendingChatRequest | null = null;
  private snapshot: WebSocketChatSnapshot;
  private readonly listeners = new Set<(snapshot: WebSocketChatSnapshot) => void>();

  constructor(private url = 'ws://127.0.0.1:8766') {
    this.snapshot = {
      url,
      connectionState: 'disconnected',
      errorMessage: '',
      isStreaming: false,
    };
  }

  getSnapshot(): WebSocketChatSnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: (snapshot: WebSocketChatSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setUrl(url: string): void {
    const nextUrl = url.trim();
    if (!nextUrl || nextUrl === this.url) {
      return;
    }

    this.url = nextUrl;

    if (this.socket || this.connectPromise) {
      this.disconnect();
    }

    this.updateSnapshot({
      url: nextUrl,
      connectionState: 'disconnected',
      errorMessage: '',
      isStreaming: false,
    });
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.manuallyDisconnected = false;
    this.updateSnapshot({
      connectionState: 'connecting',
      errorMessage: '',
    });

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let opened = false;

      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          opened = true;
          this.updateSnapshot({
            connectionState: 'connected',
            errorMessage: '',
          });
          this.connectPromise = null;
          resolve();
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.socket.onerror = () => {
          this.updateSnapshot({
            errorMessage: `Chat backend is unavailable at ${this.url}.`,
          });
        };

        this.socket.onclose = () => {
          const hadOpened = opened;

          this.updateSnapshot({
            connectionState: 'disconnected',
            isStreaming: false,
          });
          this.socket = null;

          if (this.pendingRequest) {
            this.pendingRequest.reject(new Error('WebSocket connection closed.'));
            this.pendingRequest = null;
          }

          this.connectPromise = null;

          if (!opened) {
            reject(new Error('WebSocket connection closed before it was ready.'));
          }

          if (hadOpened && !this.manuallyDisconnected) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        this.connectPromise = null;
        reject(error instanceof Error ? error : new Error('Unable to connect.'));
      }
    });

    return this.connectPromise;
  }

  disconnect(): void {
    this.manuallyDisconnected = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.updateSnapshot({
      connectionState: 'disconnected',
      isStreaming: false,
    });
  }

  async sendChatMessage(
    content: string,
    hooks?: WebSocketChatHooks,
    options: WebSocketChatRequestOptions = {},
  ): Promise<string> {
    await this.connect();

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected.');
    }

    if (this.pendingRequest) {
      throw new Error('A chat request is already in progress.');
    }

    return new Promise<string>((resolve, reject) => {
      this.pendingRequest = {
        resolve,
        reject,
        fullText: '',
        hooks,
      };

      this.updateSnapshot({
        isStreaming: true,
        errorMessage: '',
      });

      this.socket?.send(
        JSON.stringify({
          type: 'chat',
          message: content,
          sessionId: options.sessionId,
          metadata: options.metadata,
          providerConfig: options.providerConfig,
          timestamp: new Date().toISOString(),
        }),
      );
    });
  }

  private handleMessage(raw: string): void {
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = typeof data.type === 'string' ? data.type : '';

    if (type === 'chat_start') {
      this.updateSnapshot({ isStreaming: true, errorMessage: '' });
      this.pendingRequest?.hooks?.onStart?.();
      return;
    }

    if (type === 'chat_chunk') {
      const chunk = typeof data.content === 'string' ? data.content : '';
      if (!this.pendingRequest) {
        return;
      }

      this.pendingRequest.fullText += chunk;
      this.pendingRequest.hooks?.onDelta?.({
        delta: chunk,
        fullText: this.pendingRequest.fullText,
        done: false,
      });
      return;
    }

    if (type === 'chat_end') {
      if (!this.pendingRequest) {
        return;
      }

      const finalText =
        typeof data.content === 'string' && data.content.length > 0
          ? data.content
          : this.pendingRequest.fullText;

      this.pendingRequest.hooks?.onComplete?.(finalText);
      this.pendingRequest.resolve(finalText);
      this.pendingRequest = null;
      this.updateSnapshot({ isStreaming: false });
      return;
    }

    if (type === 'echo' && (data.original_message as Record<string, unknown> | undefined)?.type === 'chat') {
      if (!this.pendingRequest) {
        return;
      }

      const reply = typeof data.reply === 'string' ? data.reply : '';
      this.pendingRequest.hooks?.onComplete?.(reply);
      this.pendingRequest.resolve(reply);
      this.pendingRequest = null;
      this.updateSnapshot({ isStreaming: false });
      return;
    }

    if (type === 'error') {
      const message =
        typeof data.message === 'string' ? data.message : 'Unknown chat error.';
      this.updateSnapshot({
        errorMessage: message,
        isStreaming: false,
      });
      if (this.pendingRequest) {
        this.pendingRequest.reject(new Error(message));
        this.pendingRequest = null;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {
        this.updateSnapshot({
          connectionState: 'disconnected',
        });
      });
    }, 3000);
  }

  private updateSnapshot(patch: Partial<WebSocketChatSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    };
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

const ROLE_LABELS: Record<ChatMessage['role'], string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
};

function serializeChatPrompt(messages: ChatMessage[]): string {
  const prompt = messages
    .map((message) => `${ROLE_LABELS[message.role]}:\n${message.content}`)
    .join('\n\n');
  return `${prompt}\n\nAssistant:\n`;
}

export class WebSocketChatProvider implements ChatProvider {
  constructor(private readonly client: DesktopPetWebSocketChatClient) {}

  async generate(request: ChatRequest): Promise<ChatResponse> {
    if (request.messages.length === 0) {
      return { text: '' };
    }

    const requestMetadata = { ...(request.metadata ?? {}) };
    const providerConfig =
      requestMetadata.providerConfig &&
      typeof requestMetadata.providerConfig === 'object'
        ? (requestMetadata.providerConfig as Record<string, unknown>)
        : undefined;

    delete requestMetadata.providerConfig;

    const text = await this.client.sendChatMessage(
      serializeChatPrompt(request.messages),
      {
        onDelta: (delta) => {
          request.onDelta?.(delta);
        },
        onComplete: (fullText) => {
          request.onDelta?.({
            delta: '',
            fullText,
            done: true,
          });
        },
      },
      {
        metadata: requestMetadata,
        providerConfig,
        sessionId: request.sessionId,
      },
    );

    return { text };
  }
}
