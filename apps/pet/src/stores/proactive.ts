import { defineStore } from 'pinia';
import { ref } from 'vue';
import { loadCompanionSettings } from '@table-pet/shared';
import { getDesktopCompanionRuntime } from '../companion/runtime';
import { normalizeUiLanguage, runtimeText } from '../i18n/runtimeLocale';
import { emitRuntimeEvent, isTauriRuntime } from '../utils/runtimeEvents';
import { useVisionStore } from './vision';

interface ProactiveHandlers {
  showMessage?: (message: string) => void;
}

const runtime = getDesktopCompanionRuntime();
const LAST_FACE_DETECTED_STORAGE_KEY = 'table-pet-last-face-detected-at';
const SLEEP_REMINDER_STORAGE_KEY = 'table-pet-proactive-sleep-date';
const AWAY_REMINDER_STORAGE_KEY = 'table-pet-proactive-away-at';
const MEMORY_REMINDER_STORAGE_KEY = 'table-pet-proactive-memory-keys';

const isRunning = ref(false);
const lastSleepReminderDate = ref('');
const lastAwayReminderAt = ref(0);
const remindedMemoryKeys = ref<string[]>([]);

let proactiveHandlers: ProactiveHandlers = {};
let intervalId: number | null = null;

function extractReminderDate(key: string): string | null {
  const parts = key.split(':');
  if (parts.length < 3 || parts[0] !== 'reminder') {
    return null;
  }

  return parts[1] ?? null;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function readString(key: string): string {
  return getStorage()?.getItem(key) ?? '';
}

function writeString(key: string, value: string) {
  if (!value) {
    getStorage()?.removeItem(key);
    return;
  }

  getStorage()?.setItem(key, value);
}

function readNumber(key: string): number {
  const raw = getStorage()?.getItem(key);
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeNumber(key: string, value: number) {
  if (value > 0) {
    getStorage()?.setItem(key, String(value));
    return;
  }

  getStorage()?.removeItem(key);
}

function readStringList(key: string): string[] {
  const raw = getStorage()?.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeStringList(key: string, values: string[]) {
  getStorage()?.setItem(key, JSON.stringify(values));
}

function getSharedLastFaceDetectedAt() {
  return readNumber(LAST_FACE_DETECTED_STORAGE_KEY);
}

function currentLocale() {
  return normalizeUiLanguage(loadCompanionSettings().uiLanguage);
}

function rt(
  key: Parameters<typeof runtimeText>[1],
  params?: Record<string, string | number>,
) {
  return runtimeText(currentLocale(), key, params);
}

export const useProactiveStore = defineStore('proactive', () => {
  const visionStore = useVisionStore();

  function registerHandlers(nextHandlers: ProactiveHandlers) {
    proactiveHandlers = nextHandlers;
  }

  async function dispatchReminder(
    kind: string,
    message: string,
    summary: string,
    timestamp: string,
  ) {
    proactiveHandlers.showMessage?.(message);

    if (isTauriRuntime()) {
      await emitRuntimeEvent('proactive-reminder', {
        kind,
        message,
        timestamp,
      });
    }

    await runtime.memory.appendEventSummary({
      kind,
      summary,
      timestamp,
    });
  }

  async function tick() {
    const settings = loadCompanionSettings();
    if (!settings.proactiveEnabled) {
      return;
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    lastSleepReminderDate.value ||= readString(SLEEP_REMINDER_STORAGE_KEY);
    lastAwayReminderAt.value ||= readNumber(AWAY_REMINDER_STORAGE_KEY);
    if (remindedMemoryKeys.value.length === 0) {
      remindedMemoryKeys.value = readStringList(MEMORY_REMINDER_STORAGE_KEY);
    }

    if (settings.sleepReminderEnabled) {
      const hour = now.getHours();
      if (hour >= 23 && lastSleepReminderDate.value !== today) {
        await dispatchReminder(
          'sleep-reminder',
          rt('proactiveSleepReminder'),
          rt('proactiveSleepSummary'),
          now.toISOString(),
        );
        lastSleepReminderDate.value = today;
        writeString(SLEEP_REMINDER_STORAGE_KEY, today);
      }
    }

    const lastSeenAt = Math.max(
      visionStore.lastFaceDetectedAt,
      getSharedLastFaceDetectedAt(),
    );
    if (settings.awayDetectionEnabled && lastSeenAt > 0) {
      const awayMs = now.getTime() - lastSeenAt;
      const thresholdMs = settings.awayReminderMinutes * 60 * 1000;
      if (awayMs >= thresholdMs && now.getTime() - lastAwayReminderAt.value > thresholdMs) {
        await dispatchReminder(
          'away-reminder',
          rt('proactiveAwayReminder'),
          rt('proactiveAwaySummary', {
            minutes: settings.awayReminderMinutes,
          }),
          now.toISOString(),
        );
        lastAwayReminderAt.value = now.getTime();
        writeNumber(AWAY_REMINDER_STORAGE_KEY, lastAwayReminderAt.value);
      }
    }

    if (settings.memoryReminderEnabled) {
      const facts = await runtime.memory.getProfileFacts();
      for (const fact of facts) {
        const reminderDate = extractReminderDate(fact.key);
        if (!reminderDate || remindedMemoryKeys.value.includes(`${today}:${fact.key}`)) {
          continue;
        }

        if (reminderDate === today) {
          await dispatchReminder(
            'memory-reminder',
            rt('proactiveMemoryReminder', { value: fact.value }),
            rt('proactiveMemorySummary', { value: fact.value }),
            now.toISOString(),
          );
          remindedMemoryKeys.value = [...remindedMemoryKeys.value, `${today}:${fact.key}`];
          writeStringList(MEMORY_REMINDER_STORAGE_KEY, remindedMemoryKeys.value);
        }
      }
    }
  }

  function start() {
    if (isRunning.value) {
      return;
    }

    isRunning.value = true;
    void tick();
    intervalId = window.setInterval(() => {
      void tick();
    }, 60_000);
  }

  function stop() {
    isRunning.value = false;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  }

  return {
    isRunning,
    start,
    stop,
    tick,
    registerHandlers,
  };
});
