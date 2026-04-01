<template>
  <main class="chat-window">
    <Chat @close="closeWindow" />
  </main>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { computed, onMounted, watch } from 'vue';
import type { UiLanguage } from '@table-pet/shared';
import { normalizeUiLanguage, runtimeText } from './i18n/runtimeLocale';
import { useCompanionConfigStore } from './stores/companionConfig';
import Chat from './components/Chat.vue';

const companionConfigStore = useCompanionConfigStore();
const currentLocale = computed<UiLanguage>(() =>
  normalizeUiLanguage(companionConfigStore.settings.uiLanguage),
);

async function closeWindow() {
  await getCurrentWindow().close();
}

onMounted(async () => {
  companionConfigStore.load();
  document.title = runtimeText(currentLocale.value, 'windowChatTitle');
});

watch(currentLocale, () => {
  const title = runtimeText(currentLocale.value, 'windowChatTitle');
  document.title = title;
});
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: #f4f7fb;
}

#app, .chat-window {
  width: 100%;
  height: 100%;
}
</style>
