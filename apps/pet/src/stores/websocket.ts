import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  DEFAULT_COMPANION_SETTINGS,
  loadCompanionSettings,
  type CompanionSettings,
} from '@table-pet/shared';
import { getDesktopCompanionRuntime } from '../companion/runtime';
import { localizeRuntimeText, normalizeUiLanguage } from '../i18n/runtimeLocale';
import { ensureBackendService } from '../utils/desktopCommands';

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
  status?: 'streaming' | 'complete';
}

const runtime = getDesktopCompanionRuntime();
const sharedMessages = ref<ChatMessage[]>([]);
const sharedConnected = ref(
  runtime.chatClient.getSnapshot().connectionState === 'connected',
);
const sharedPending = ref(runtime.chatClient.getSnapshot().isStreaming);
const sharedError = ref(runtime.chatClient.getSnapshot().errorMessage);
let subscribedToRuntime = false;
let hydratedConversation = false;
let hydratePromise: Promise<void> | null = null;

const DEFAULT_SESSION_ID = 'default';

function normalizeBackendUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed || DEFAULT_COMPANION_SETTINGS.chatBackendUrl;
}

function localizeMessage(message: string) {
  const locale = normalizeUiLanguage(loadCompanionSettings().uiLanguage);
  if (locale === 'zh-CN' && message === 'Unable to start the local backend service.') {
    return '无法启动本地后端服务。';
  }
  return localizeRuntimeText(locale, message);
}

function buildProviderConfig(settings: CompanionSettings) {
  return {
    provider: settings.defaultChatProvider,
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
    openaiBaseUrl: settings.openaiBaseUrl,
    openaiApiKey: settings.openaiApiKey,
    openaiModel: settings.openaiModel,
    zhipuBaseUrl: settings.zhipuBaseUrl,
    zhipuApiKey: settings.zhipuApiKey,
    zhipuModel: settings.zhipuModel,
    qwenLocalModelPath: settings.qwenLocalModelPath,
    qwenLocalContextSize: settings.qwenLocalContextSize,
    qwenLocalThreads: settings.qwenLocalThreads,
    qwenLocalGpuLayers: settings.qwenLocalGpuLayers,
    searchEnabled: settings.searchEnabled,
    searchProvider: settings.searchProvider,
    searchMaxResults: settings.searchMaxResults,
    temperature: settings.chatTemperature,
    maxTokens: settings.chatMaxTokens,
  };
}

async function hydrateConversation() {
  if (hydratedConversation) {
    return;
  }

  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    const turns = await runtime.memory.getConversation(DEFAULT_SESSION_ID);
    sharedMessages.value = turns
      .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
      .map((turn) => ({
        id: turn.id,
        type: turn.role === 'user' ? 'user' : 'ai',
        content: turn.content,
        timestamp: turn.createdAt,
        status: 'complete' as const,
      }));
    hydratedConversation = true;
    hydratePromise = null;
  })();

  return hydratePromise;
}

function ensureRuntimeSubscription() {
  if (subscribedToRuntime) {
    return;
  }

  runtime.chatClient.subscribe((snapshot) => {
    sharedConnected.value = snapshot.connectionState === 'connected';
    sharedPending.value = snapshot.isStreaming;
    sharedError.value = snapshot.errorMessage;
  });

  subscribedToRuntime = true;
}

export const useWebSocketStore = defineStore('websocket', () => {
  ensureRuntimeSubscription();
  void hydrateConversation();

  async function connect() {
    const companionSettings = loadCompanionSettings();
    await ensureBackendService({
      backendUrl: companionSettings.chatBackendUrl,
      timeoutMs: 12000,
    });
    runtime.chatClient.setUrl(normalizeBackendUrl(companionSettings.chatBackendUrl));
    await runtime.chatClient.connect();
  }

  function disconnect() {
    runtime.chatClient.disconnect();
  }

  async function sendChatMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    if (sharedPending.value) {
      sharedError.value = localizeMessage('Another chat request is still running.');
      return;
    }

    let assistantMessage: ChatMessage | null = null;

    try {
      const companionSettings = loadCompanionSettings();
      runtime.chatClient.setUrl(normalizeBackendUrl(companionSettings.chatBackendUrl));
      await hydrateConversation();

      sharedMessages.value.push({
        id: crypto.randomUUID(),
        type: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
        status: 'complete',
      });

      await connect();
      await runtime.core.sendText({
        text: trimmed,
        sessionId: DEFAULT_SESSION_ID,
        source: 'chat',
        metadata: {
          userText: trimmed,
          providerConfig: buildProviderConfig(companionSettings),
        },
        onAssistantDelta: (delta) => {
          if (!assistantMessage) {
            assistantMessage = {
              id: crypto.randomUUID(),
              type: 'ai',
              content: delta.fullText ?? delta.delta,
              timestamp: new Date().toISOString(),
              status: delta.done ? 'complete' : 'streaming',
            };
            sharedMessages.value.push(assistantMessage);
            return;
          }

          assistantMessage.content =
            delta.fullText ?? assistantMessage.content + delta.delta;
          assistantMessage.status = delta.done ? 'complete' : 'streaming';
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send chat message.';
      sharedError.value =
        message === 'WebSocket connection closed before it was ready.'
          ? localizeMessage('Chat backend is offline. Start the Python websocket server first.')
          : localizeMessage(message);
    }
  }

  async function clearMessages() {
    await runtime.memory.clearConversation(DEFAULT_SESSION_ID);
    sharedMessages.value = [];
    sharedError.value = '';
  }

  return {
    isConnected: sharedConnected,
    isPending: sharedPending,
    messages: sharedMessages,
    errorMessage: sharedError,
    connect,
    disconnect,
    sendChatMessage,
    clearMessages,
  };
});
