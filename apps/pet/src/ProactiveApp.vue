<template>
  <main class="proactive-host">
    <p>{{ rt('proactiveServiceRunning') }}</p>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import type { CompanionSettings, UiLanguage } from '@table-pet/shared';
import {
  normalizeUiLanguage,
  runtimeText,
} from './i18n/runtimeLocale';
import { useCompanionConfigStore } from './stores/companionConfig';
import { useDesktopServicesStore } from './stores/desktopServices';
import { useProactiveStore } from './stores/proactive';
import { updateGlobalShortcuts } from './utils/desktopCommands';
import { listenRuntimeEvent } from './utils/runtimeEvents';

const companionConfigStore = useCompanionConfigStore();
const proactiveStore = useProactiveStore();
const desktopServicesStore = useDesktopServicesStore();
const currentLocale = computed<UiLanguage>(() =>
  normalizeUiLanguage(companionConfigStore.settings.uiLanguage),
);
const rt = (
  key: Parameters<typeof runtimeText>[1],
  params?: Record<string, string | number>,
) => runtimeText(currentLocale.value, key, params);

let unlistenCompanionSettings: (() => void) | null = null;

function showNotification(message: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    console.info('[proactive]', message);
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(rt('proactiveNotificationTitle'), { body: message });
    return;
  }

  if (Notification.permission === 'default') {
    void Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(rt('proactiveNotificationTitle'), { body: message });
        return;
      }

      console.info('[proactive]', message);
    });
    return;
  }

  console.info('[proactive]', message);
}

function refreshCompanionSettings(partial?: Partial<CompanionSettings>) {
  const nextSettings = partial
    ? companionConfigStore.applySettings(partial)
    : companionConfigStore.load();

  const shouldRunDesktopServices =
    nextSettings.clipboardWatcherEnabled ||
    nextSettings.hardwareMonitoringEnabled ||
    nextSettings.pomodoroEnabled ||
    nextSettings.affectionSystemEnabled;

  if (nextSettings.proactiveEnabled) {
    proactiveStore.start();
  } else {
    proactiveStore.stop();
  }

  if (shouldRunDesktopServices) {
    desktopServicesStore.stop();
    desktopServicesStore.start();
  } else {
    desktopServicesStore.stop();
  }

  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    void updateGlobalShortcuts({
      bossKey: nextSettings.bossKeyShortcut,
      voiceRecord: nextSettings.voiceRecordShortcut,
      screenshotTranslate: nextSettings.screenshotTranslateShortcut,
    }).catch((error) => {
      console.error('Global shortcut registration failed:', error);
    });
  }
}

onMounted(async () => {
  document.title = rt('windowProactiveTitle');
  proactiveStore.registerHandlers({
    showMessage: (message) => {
      showNotification(message);
    },
  });
  desktopServicesStore.registerHandlers({
    showMessage: (message) => {
      showNotification(message);
    },
  });

  refreshCompanionSettings();

  unlistenCompanionSettings = await listenRuntimeEvent(
    'companion-settings-changed',
    (payload) => {
      refreshCompanionSettings((payload ?? {}) as Partial<CompanionSettings>);
    },
  );
});

watch(currentLocale, () => {
  document.title = rt('windowProactiveTitle');
});

onUnmounted(() => {
  proactiveStore.stop();
  desktopServicesStore.stop();
  unlistenCompanionSettings?.();
});
</script>

<style scoped>
.proactive-host {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: transparent;
  color: transparent;
  font-size: 1px;
  user-select: none;
}
</style>
