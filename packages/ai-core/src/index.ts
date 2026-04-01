import type { ChatProvider } from '@table-pet/providers';

export * from '@table-pet/core';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIConfig {
  provider: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  adapter?: ChatProvider;
}

export class AICore {
  private readonly config: AIConfig;
  private messages: ChatMessage[] = [];

  constructor(config: AIConfig) {
    this.config = config;
  }

  async chat(message: string): Promise<string> {
    this.messages.push({ role: 'user', content: message });

    if (!this.config.adapter) {
      return 'AI chat runtime is not configured yet.';
    }

    const response = await this.config.adapter.generate({
      messages: this.messages.map((item) => ({
        role: item.role,
        content: item.content,
      })),
    });

    this.messages.push({ role: 'assistant', content: response.text });
    return response.text;
  }

  reset() {
    this.messages = [];
  }
}

export function createAI(config: AIConfig): AICore {
  return new AICore(config);
}
