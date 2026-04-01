<template>
  <main class="overlay-shell" :class="{ visible: Boolean(result) }">
    <section v-if="result" class="overlay-card">
      <header class="overlay-head">
        <div>
          <p class="overlay-kicker">{{ titleKicker }}</p>
          <h1>{{ titleText }}</h1>
          <p class="overlay-meta">{{ metaText }}</p>
        </div>
        <button class="icon-btn" :title="closeLabel" @click="hideWindow">X</button>
      </header>

      <p v-if="result.error" class="overlay-error">
        {{ result.error }}
      </p>

      <div class="overlay-actions">
        <button class="action-btn" :disabled="!result.originalText" @click="copyOriginal">
          {{ copyOriginalLabel }}
        </button>
        <button
          class="action-btn"
          :disabled="!result.translatedText"
          @click="copyTranslated"
        >
          {{ copyTranslatedLabel }}
        </button>
        <button
          class="action-btn action-btn-accent"
          :disabled="isReading || !speakableText"
          @click="readAloud"
        >
          {{ isReading ? readingLabel : speakLabel }}
        </button>
        <button class="action-btn" @click="hideWindow">
          {{ closeLabel }}
        </button>
      </div>

      <p v-if="actionMessage" class="overlay-status">
        {{ actionMessage }}
      </p>

      <div class="panel-grid">
        <article class="text-panel">
          <div class="panel-head">
            <h2>{{ originalLabel }}</h2>
          </div>
          <pre>{{ result.originalText || emptyOriginalText }}</pre>
        </article>

        <article class="text-panel accent-panel">
          <div class="panel-head">
            <h2>{{ translatedLabel }}</h2>
          </div>
          <pre>{{ result.translatedText || emptyTranslatedText }}</pre>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { loadCompanionSettings } from '@table-pet/shared';
import { useVoiceStore } from './stores/voice';
import type { ScreenshotTranslationResult } from './stores/screenshotTranslation';
import { isTauriRuntime } from './utils/runtimeEvents';
import { writeClipboardText } from './utils/desktopCommands';
import { listenRuntimeEvent } from './utils/runtimeEvents';

type UiLanguage = 'en' | 'zh-CN';

const voiceStore = useVoiceStore();
const result = ref<ScreenshotTranslationResult | null>(null);
const locale = ref<UiLanguage>(
  loadCompanionSettings().uiLanguage === 'zh-CN' ? 'zh-CN' : 'en',
);
const actionMessage = ref('');
const isReading = ref(false);

const titleKicker = computed(() =>
  locale.value === 'zh-CN'
    ? '\u622a\u56fe\u7ffb\u8bd1'
    : 'Screenshot Translation',
);
const titleText = computed(() =>
  locale.value === 'zh-CN'
    ? 'OCR \u4e0e\u7ffb\u8bd1\u7ed3\u679c'
    : 'OCR and Translation Result',
);
const originalLabel = computed(() =>
  locale.value === 'zh-CN' ? '\u539f\u6587' : 'Original OCR Text',
);
const translatedLabel = computed(() =>
  locale.value === 'zh-CN' ? '\u7ffb\u8bd1' : 'Translated Text',
);
const emptyOriginalText = computed(() =>
  locale.value === 'zh-CN'
    ? '\u672a\u8bc6\u522b\u5230\u6587\u5b57\u3002'
    : 'No text was detected.',
);
const emptyTranslatedText = computed(() =>
  locale.value === 'zh-CN'
    ? '\u6682\u65e0\u7ffb\u8bd1\u7ed3\u679c\u3002'
    : 'No translation result.',
);
const copyOriginalLabel = computed(() =>
  locale.value === 'zh-CN' ? '\u590d\u5236\u539f\u6587' : 'Copy original',
);
const copyTranslatedLabel = computed(() =>
  locale.value === 'zh-CN' ? '\u590d\u5236\u7ffb\u8bd1' : 'Copy translation',
);
const speakLabel = computed(() =>
  locale.value === 'zh-CN' ? '\u6717\u8bfb' : 'Read aloud',
);
const readingLabel = computed(() =>
  locale.value === 'zh-CN' ? '\u6717\u8bfb\u4e2d...' : 'Reading...',
);
const closeLabel = computed(() =>
  locale.value === 'zh-CN' ? '\u5173\u95ed' : 'Close',
);
const speakableText = computed(() =>
  (result.value?.translatedText || result.value?.originalText || '').trim(),
);
const metaText = computed(() => {
  if (!result.value) {
    return '';
  }

  const time = new Date(result.value.capturedAt).toLocaleTimeString(
    locale.value === 'zh-CN' ? 'zh-CN' : 'en-US',
  );
  return `${result.value.width} x ${result.value.height} | ${time}`;
});

let unlistenResult: (() => void) | null = null;
let unlistenSettings: (() => void) | null = null;
let hideTimer: number | null = null;

async function showWindow() {
  const currentWindow = getCurrentWindow();
  await currentWindow.show();
}

async function hideWindow() {
  const currentWindow = getCurrentWindow();
  await currentWindow.hide();
}

function refreshHideTimer() {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
  }

  hideTimer = window.setTimeout(() => {
    void hideWindow();
  }, 20_000);
}

async function copyToClipboard(content: string) {
  if (isTauriRuntime()) {
    await writeClipboardText(content);
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  throw new Error('Clipboard write is unavailable in this runtime.');
}

async function copyText(value: string, copiedLabel: 'original' | 'translated') {
  const content = value.trim();
  if (!content) {
    return;
  }

  try {
    await copyToClipboard(content);
    actionMessage.value =
      locale.value === 'zh-CN'
        ? copiedLabel === 'original'
          ? '\u5df2\u590d\u5236\u539f\u6587\u3002'
          : '\u5df2\u590d\u5236\u7ffb\u8bd1\u3002'
        : copiedLabel === 'original'
          ? 'Original text copied.'
          : 'Translated text copied.';
    refreshHideTimer();
  } catch (error) {
    actionMessage.value =
      error instanceof Error
        ? error.message
        : locale.value === 'zh-CN'
          ? '\u590d\u5236\u5931\u8d25\u3002'
          : 'Copy failed.';
  }
}

async function copyOriginal() {
  await copyText(result.value?.originalText || '', 'original');
}

async function copyTranslated() {
  await copyText(result.value?.translatedText || '', 'translated');
}

async function readAloud() {
  const text = speakableText.value;
  if (!text) {
    return;
  }

  isReading.value = true;
  actionMessage.value = '';
  refreshHideTimer();

  try {
    await voiceStore.speakPreviewText(text);
    actionMessage.value =
      locale.value === 'zh-CN'
        ? '\u5df2\u542f\u52a8\u6717\u8bfb\u3002'
        : 'Reading started.';
  } catch (error) {
    actionMessage.value =
      error instanceof Error
        ? error.message
        : locale.value === 'zh-CN'
          ? '\u6717\u8bfb\u5931\u8d25\u3002'
          : 'Read-aloud failed.';
  } finally {
    isReading.value = false;
  }
}

onMounted(async () => {
  document.title = titleText.value;
  unlistenResult = await listenRuntimeEvent('screenshot-translation-result', (payload) => {
    result.value = payload;
    actionMessage.value = '';
    void showWindow();
    refreshHideTimer();
  });
  unlistenSettings = await listenRuntimeEvent('companion-settings-changed', () => {
    locale.value = loadCompanionSettings().uiLanguage === 'zh-CN' ? 'zh-CN' : 'en';
    document.title = titleText.value;
  });
});

onUnmounted(() => {
  unlistenResult?.();
  unlistenSettings?.();
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
  }
});
</script>

<style scoped>
:global(body) {
  margin: 0;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: transparent;
}

.overlay-shell {
  min-height: 100vh;
  padding: 14px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.overlay-card {
  width: min(960px, calc(100vw - 28px));
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background:
    radial-gradient(circle at top left, rgba(0, 184, 212, 0.16), transparent 30%),
    radial-gradient(circle at top right, rgba(255, 186, 73, 0.18), transparent 34%),
    rgba(12, 18, 30, 0.92);
  color: #f7f8fb;
  box-shadow: 0 24px 50px rgba(3, 9, 19, 0.42);
  backdrop-filter: blur(16px);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overlay-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.overlay-kicker {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9ad7ff;
}

.overlay-head h1 {
  margin: 0;
  font-size: 24px;
}

.overlay-meta {
  margin: 8px 0 0;
  color: rgba(247, 248, 251, 0.68);
  font-size: 13px;
}

.overlay-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.action-btn,
.icon-btn {
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    background 0.16s ease,
    opacity 0.16s ease;
}

.action-btn {
  min-height: 38px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.08);
  color: #f7f8fb;
  font-size: 13px;
}

.action-btn:hover:not(:disabled),
.icon-btn:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.14);
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-btn-accent {
  background: linear-gradient(135deg, rgba(52, 182, 255, 0.92), rgba(255, 188, 87, 0.88));
  color: #0c1420;
  font-weight: 700;
}

.icon-btn {
  width: 38px;
  height: 38px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font-size: 18px;
  font-weight: 700;
}

.overlay-status {
  margin: 0;
  min-height: 20px;
  color: #9ad7ff;
  font-size: 13px;
}

.overlay-error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 96, 96, 0.14);
  color: #ffb7b7;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.text-panel {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 16px;
}

.accent-panel {
  background: rgba(33, 151, 255, 0.12);
  border-color: rgba(83, 185, 255, 0.24);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.text-panel h2 {
  margin: 0 0 10px;
  font-size: 14px;
  color: #ffd78a;
}

.text-panel pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  font-size: 14px;
}

@media (max-width: 720px) {
  .panel-grid {
    grid-template-columns: 1fr;
  }

  .overlay-card {
    width: calc(100vw - 20px);
    border-radius: 22px;
  }
}
</style>
