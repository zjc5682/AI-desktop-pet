<template>
  <div class="chat-container">
    <div class="chat-header">
      <span class="chat-title">{{ rt('chatTitle') }}</span>
      <div class="chat-header-actions">
        <button class="header-btn" @click="clearConversation">{{ rt('chatClear') }}</button>
        <button class="close-btn" @click="$emit('close')">x</button>
      </div>
    </div>

    <div ref="messagesContainer" class="chat-messages">
      <div
        v-for="msg in wsStore.messages"
        :key="msg.id"
        :class="['message', msg.type]"
      >
        <div class="message-content" v-html="renderMarkdown(msg.content)"></div>
        <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
      </div>
    </div>

    <div class="chat-input-area">
      <input
        v-model="inputMessage"
        class="chat-input"
        :disabled="wsStore.isPending"
        :placeholder="rt('chatPlaceholder')"
        @keyup.enter="sendMessage"
      />
      <button
        class="send-btn"
        :disabled="wsStore.isPending"
        @click="sendMessage"
      >
        {{ wsStore.isPending ? '...' : rt('chatSend') }}
      </button>
    </div>

    <div v-if="wsStore.errorMessage" class="error-message">
      {{ localizedErrorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { CompanionSettings, UiLanguage } from '@table-pet/shared';
import { localizeRuntimeText, normalizeUiLanguage, runtimeText } from '../i18n/runtimeLocale';
import { useCompanionConfigStore } from '../stores/companionConfig';
import { useWebSocketStore } from '../stores/websocket';
import { listenRuntimeEvent } from '../utils/runtimeEvents';

defineEmits<{
  close: [];
}>();

const wsStore = useWebSocketStore();
const companionConfigStore = useCompanionConfigStore();
const inputMessage = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
let unlistenCompanionSettings: (() => void) | null = null;

const currentLocale = computed<UiLanguage>(() =>
  normalizeUiLanguage(companionConfigStore.settings.uiLanguage),
);
const rt = (
  key: Parameters<typeof runtimeText>[1],
  params?: Record<string, string | number>,
) => runtimeText(currentLocale.value, key, params);
const localizedErrorMessage = computed(() =>
  localizeRuntimeText(currentLocale.value, wsStore.errorMessage),
);

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

function renderMarkdown(content: string): string {
  return md.render(content);
}

function sendMessage() {
  if (!inputMessage.value.trim() || wsStore.isPending) {
    return;
  }

  void wsStore.sendChatMessage(inputMessage.value);
  inputMessage.value = '';
}

function clearConversation() {
  void wsStore.clearMessages();
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(currentLocale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function refreshCompanionSettings(partial?: Partial<CompanionSettings>) {
  if (partial) {
    companionConfigStore.applySettings(partial);
  } else {
    companionConfigStore.load();
  }
}

watch(
  () => wsStore.messages.length,
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      }
    });
  },
);

onMounted(async () => {
  await refreshCompanionSettings();
  unlistenCompanionSettings = await listenRuntimeEvent(
    'companion-settings-changed',
    (payload) => {
      void refreshCompanionSettings((payload ?? {}) as Partial<CompanionSettings>);
    },
  );
});

onUnmounted(() => {
  unlistenCompanionSettings?.();
  wsStore.disconnect();
});
</script>

<style scoped>
.chat-container {
  width: 100%;
  height: 100%;
  background: white;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  background: #4a90e2;
  color: white;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-title {
  font-weight: bold;
  font-size: 16px;
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn,
.close-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
}

.header-btn {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
}

.close-btn {
  font-size: 24px;
  padding: 0;
  line-height: 1;
}

.header-btn:hover,
.close-btn:hover {
  opacity: 0.8;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  line-height: 1.4;
}

.message.user {
  align-self: flex-end;
  background: #4a90e2;
  color: white;
  border-bottom-right-radius: 4px;
}

.message.ai {
  align-self: flex-start;
  background: #f0f0f0;
  color: #333;
  border-bottom-left-radius: 4px;
}

.message-content {
  word-wrap: break-word;
}

.message-time {
  font-size: 10px;
  opacity: 0.7;
  margin-top: 4px;
  text-align: right;
}

.chat-input-area {
  padding: 12px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 8px;
}

.chat-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 20px;
  outline: none;
  font-size: 14px;
}

.chat-input:focus {
  border-color: #4a90e2;
}

.send-btn {
  background: #4a90e2;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.send-btn:hover {
  background: #357abd;
}

.error-message {
  padding: 8px 12px;
  background: #fee;
  color: #c33;
  font-size: 12px;
  text-align: center;
}
</style>
