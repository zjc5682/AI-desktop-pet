import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RelationshipState } from '@table-pet/memory';
import {
  loadCompanionSettings,
  type CompanionSettings,
} from '@table-pet/shared';
import { getDesktopCompanionRuntime } from '../companion/runtime';
import {
  batchRenameFiles,
  fetchWebpagePreview,
  getSystemMetrics,
  organizeDirectory,
  readClipboardText,
  type BatchRenameResponse,
  type OrganizeDirectoryResponse,
  type SystemMetrics,
} from '../utils/desktopCommands';
import { emitRuntimeEvent, isTauriRuntime } from '../utils/runtimeEvents';

interface DesktopServiceHandlers {
  showMessage?: (message: string) => void;
}

type ClipboardKind = 'code' | 'link' | 'error' | 'text' | 'none';
type PomodoroPhase = 'idle' | 'work' | 'break';

const runtime = getDesktopCompanionRuntime();
const DESKTOP_SESSION_ID = 'desktop-background';
const HARDWARE_WARNING_COOLDOWN_MS = 20 * 60 * 1000;
const AUTO_ORGANIZE_INTERVAL_MS = 60 * 60 * 1000;
const LAST_AUTO_ORGANIZE_AT_KEY = 'table-pet-last-auto-organize-at';

const isRunning = ref(false);
const lastClipboardText = ref('');
const lastClipboardAt = ref(0);
const lastSystemMetrics = ref<SystemMetrics | null>(null);
const lastInsightMessage = ref('');
const lastWarningMessage = ref('');
const lastPomodoroMessageAt = ref(0);
const relationshipState = ref<RelationshipState | null>(null);
const pomodoroPhase = ref<PomodoroPhase>('idle');
const pomodoroEndsAt = ref(0);

let desktopHandlers: DesktopServiceHandlers = {};
let intervalId: number | null = null;
let lastHardwarePollAt = 0;
let lastRelationshipSyncAt = 0;
let lastAutoOrganizeAt = 0;
const warningCooldowns = new Map<string, number>();

function nowIso(): string {
  return new Date().toISOString();
}

function getSettings(): CompanionSettings {
  return loadCompanionSettings();
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

function currentLanguage(settings: CompanionSettings): 'en' | 'zh-CN' {
  return settings.uiLanguage === 'zh-CN' ? 'zh-CN' : 'en';
}

function localizedMessage(
  settings: CompanionSettings,
  english: string,
  chinese: string,
): string {
  return currentLanguage(settings) === 'zh-CN' ? chinese : english;
}

function clipText(text: string, maxLength = 220): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function readStoredNumber(key: string): number {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 0;
  }

  const value = Number(window.localStorage.getItem(key) ?? '0');
  return Number.isFinite(value) ? value : 0;
}

function writeStoredNumber(key: string, value: number) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, String(value));
}

function classifyClipboardText(text: string): ClipboardKind {
  const normalized = String(text || '').trim();
  if (normalized.length < 6) {
    return 'none';
  }

  if (/^https?:\/\//i.test(normalized)) {
    return 'link';
  }

  if (
    /(traceback|exception|error:|uncaught|failed|enoent|typeerror|referenceerror|syntaxerror|stack trace|错误|报错|失败)/i.test(
      normalized,
    )
  ) {
    return 'error';
  }

  const lineCount = normalized.split(/\r?\n/).length;
  if (
    lineCount >= 2 &&
    /(\bconst\b|\blet\b|\bfunction\b|\bclass\b|\bimport\b|\bexport\b|\bdef\b|\breturn\b|=>|{|}|;|<\/?[a-z][^>]*>)/i.test(
      normalized,
    )
  ) {
    return 'code';
  }

  return 'text';
}

async function emitInsight(
  kind: string,
  message: string,
  summary: string,
  severity: 'info' | 'warning' | 'critical' = 'info',
) {
  const timestamp = nowIso();
  if (severity === 'info') {
    lastInsightMessage.value = message;
    desktopHandlers.showMessage?.(message);
    if (isTauriRuntime()) {
      await emitRuntimeEvent('desktop-insight', {
        kind,
        message,
        summary,
        timestamp,
      });
    }
  } else {
    lastWarningMessage.value = message;
    desktopHandlers.showMessage?.(message);
    if (isTauriRuntime()) {
      await emitRuntimeEvent('desktop-warning', {
        kind,
        message,
        summary,
        timestamp,
        severity,
      });
    }
  }

  await runtime.memory.appendEventSummary({
    kind,
    summary,
    timestamp,
  });
}

function shouldNotifyWarning(kind: string, timestamp: number): boolean {
  const lastSentAt = warningCooldowns.get(kind) ?? 0;
  if (timestamp - lastSentAt < HARDWARE_WARNING_COOLDOWN_MS) {
    return false;
  }

  warningCooldowns.set(kind, timestamp);
  return true;
}

async function analyzeClipboardText(
  text: string,
  settings: CompanionSettings,
): Promise<void> {
  const kind = classifyClipboardText(text);
  if (kind === 'none' || kind === 'text') {
    return;
  }

  if (pomodoroPhase.value === 'work' && settings.focusQuietModeEnabled && kind !== 'error') {
    await runtime.memory.appendEventSummary({
      kind: `clipboard-${kind}`,
      summary: `Clipboard ${kind} captured during quiet focus mode.`,
      timestamp: nowIso(),
    });
    return;
  }

  if (kind === 'code' && !settings.clipboardCodeInsightsEnabled) {
    return;
  }
  if (kind === 'link' && !settings.clipboardLinkSummaryEnabled) {
    return;
  }
  if (kind === 'error' && !settings.clipboardErrorAnalysisEnabled) {
    return;
  }

  const promptByKind: Record<Exclude<ClipboardKind, 'none' | 'text'>, string> = {
    code:
      'The user copied code into the clipboard. Explain what it does in a short practical way, then mention one likely risk or caveat.\n\nClipboard content:\n',
    link:
      'The user copied a URL. Summarize what the link appears to be about from the URL itself, point out the source, and suggest what action to take next. If full page content is unavailable, say so clearly.\n\nClipboard content:\n',
    error:
      'The user copied an error. Diagnose the likely cause and give short fix steps with the most likely first action.\n\nClipboard content:\n',
  };

  try {
    let linkContext = '';
    if (kind === 'link') {
      try {
        const preview = await fetchWebpagePreview(text);
        linkContext = [
          `Fetched page title: ${preview.title}`,
          preview.excerpt ? `Fetched excerpt: ${preview.excerpt}` : '',
          preview.content ? `Fetched content:\n${preview.content}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to fetch webpage.';
        linkContext = `Webpage fetch failed: ${message}`;
      }
    }

    const reply = await runtime.core.sendText({
      text:
        kind === 'link' && linkContext
          ? `${promptByKind[kind]}${text}\n\n${linkContext}`
          : `${promptByKind[kind]}${text}`,
      sessionId: DESKTOP_SESSION_ID,
      source: 'clipboard',
      memoryOptions: { limit: 4, minScore: 0.15 },
      metadata: {
        userText: text,
        providerConfig: buildProviderConfig(settings),
        desktopClipboardKind: kind,
      },
    });

    const prefixByKind = {
      code: localizedMessage(settings, 'Clipboard code insight', '剪贴板代码解读'),
      link: localizedMessage(settings, 'Clipboard link summary', '剪贴板链接摘要'),
      error: localizedMessage(settings, 'Clipboard error analysis', '剪贴板报错分析'),
    };
    const summary = `${prefixByKind[kind]}: ${clipText(reply.text, 280)}`;
    await emitInsight(
      `clipboard-${kind}`,
      clipText(`${prefixByKind[kind]}: ${reply.text}`, 180),
      summary,
    );
  } catch (error) {
    const fallbackMessage =
      error instanceof Error ? error.message : 'Clipboard analysis failed.';
    await emitInsight(
      `clipboard-${kind}-error`,
      clipText(fallbackMessage, 180),
      `Clipboard ${kind} analysis failed: ${fallbackMessage}`,
      'warning',
    );
  }
}

async function tickAutoOrganizer(settings: CompanionSettings): Promise<void> {
  if (!settings.desktopOrganizerEnabled || !isTauriRuntime()) {
    return;
  }

  const now = Date.now();
  if (!lastAutoOrganizeAt) {
    lastAutoOrganizeAt = readStoredNumber(LAST_AUTO_ORGANIZE_AT_KEY);
  }
  if (now - lastAutoOrganizeAt < AUTO_ORGANIZE_INTERVAL_MS) {
    return;
  }

  lastAutoOrganizeAt = now;
  writeStoredNumber(LAST_AUTO_ORGANIZE_AT_KEY, now);

  try {
    const result = await organizeDirectory({
      path: settings.desktopOrganizerPath,
      createFolders: settings.desktopOrganizerAutoFolders,
    });
    if (result.movedCount > 0) {
      await emitInsight(
        'desktop-auto-organize',
        localizedMessage(
          settings,
          `Desktop organizer moved ${result.movedCount} file(s).`,
          `桌面整理器已移动 ${result.movedCount} 个文件。`,
        ),
        `Desktop organizer moved ${result.movedCount} file(s) in ${result.root}.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Desktop organizer failed.';
    await emitInsight(
      'desktop-auto-organize-error',
      clipText(message, 180),
      `Desktop organizer failed: ${message}`,
      'warning',
    );
  }
}

async function tickClipboard(settings: CompanionSettings): Promise<void> {
  if (!settings.clipboardWatcherEnabled || !isTauriRuntime()) {
    return;
  }

  try {
    const nextClipboardText = (await readClipboardText()).trim();
    if (!nextClipboardText || nextClipboardText === lastClipboardText.value) {
      return;
    }

    lastClipboardText.value = nextClipboardText;
    lastClipboardAt.value = Date.now();
    await analyzeClipboardText(nextClipboardText, settings);
  } catch {
    // Clipboard access can temporarily fail when other applications lock it.
  }
}

async function tickHardware(settings: CompanionSettings): Promise<void> {
  if (!settings.hardwareMonitoringEnabled || !isTauriRuntime()) {
    return;
  }

  const metrics = await getSystemMetrics();
  lastSystemMetrics.value = metrics;
  const now = Date.now();

  if (
    metrics.cpuUsagePercent >= settings.cpuUsageAlertThreshold &&
    shouldNotifyWarning('cpu-usage', now)
  ) {
    await emitInsight(
      'system-cpu-usage',
      localizedMessage(
        settings,
        `CPU usage is high at ${metrics.cpuUsagePercent.toFixed(0)}%.`,
        `CPU 占用偏高，当前约 ${metrics.cpuUsagePercent.toFixed(0)}%。`,
      ),
      `CPU usage warning at ${metrics.cpuUsagePercent.toFixed(1)}%.`,
      'warning',
    );
  }

  if (
    metrics.memoryUsagePercent >= settings.memoryUsageAlertThreshold &&
    shouldNotifyWarning('memory-usage', now)
  ) {
    await emitInsight(
      'system-memory-usage',
      localizedMessage(
        settings,
        `Memory usage is high at ${metrics.memoryUsagePercent.toFixed(0)}%.`,
        `内存占用偏高，当前约 ${metrics.memoryUsagePercent.toFixed(0)}%。`,
      ),
      `Memory usage warning at ${metrics.memoryUsagePercent.toFixed(1)}%.`,
      'warning',
    );
  }

  if (
    typeof metrics.cpuTemperatureC === 'number' &&
    metrics.cpuTemperatureC >= settings.cpuTemperatureAlertThreshold &&
    shouldNotifyWarning('cpu-temperature', now)
  ) {
    await emitInsight(
      'system-cpu-temperature',
      localizedMessage(
        settings,
        `CPU temperature is high at ${metrics.cpuTemperatureC.toFixed(0)}°C.`,
        `CPU 温度偏高，当前约 ${metrics.cpuTemperatureC.toFixed(0)}°C。`,
      ),
      `CPU temperature warning at ${metrics.cpuTemperatureC.toFixed(1)}°C.`,
      'warning',
    );
  }

  if (
    typeof metrics.gpuTemperatureC === 'number' &&
    metrics.gpuTemperatureC >= settings.cpuTemperatureAlertThreshold &&
    shouldNotifyWarning('gpu-temperature', now)
  ) {
    await emitInsight(
      'system-gpu-temperature',
      localizedMessage(
        settings,
        `GPU temperature is high at ${metrics.gpuTemperatureC.toFixed(0)}°C.`,
        `GPU 温度偏高，当前约 ${metrics.gpuTemperatureC.toFixed(0)}°C。`,
      ),
      `GPU temperature warning at ${metrics.gpuTemperatureC.toFixed(1)}°C.`,
      'warning',
    );
  }

  if (
    metrics.battery &&
    !metrics.battery.isCharging &&
    metrics.battery.percentage <= settings.batteryLowThreshold &&
    shouldNotifyWarning('battery-low', now)
  ) {
    await emitInsight(
      'system-battery-low',
      localizedMessage(
        settings,
        `Battery is low at ${metrics.battery.percentage.toFixed(0)}%.`,
        `电池电量偏低，当前约 ${metrics.battery.percentage.toFixed(0)}%。`,
      ),
      `Battery low warning at ${metrics.battery.percentage.toFixed(1)}%.`,
      'warning',
    );
  }
}

async function tickPomodoro(settings: CompanionSettings): Promise<void> {
  if (!settings.pomodoroEnabled) {
    pomodoroPhase.value = 'idle';
    pomodoroEndsAt.value = 0;
    return;
  }

  const now = Date.now();
  if (pomodoroPhase.value === 'idle' || pomodoroEndsAt.value <= 0) {
    pomodoroPhase.value = 'work';
    pomodoroEndsAt.value = now + settings.pomodoroWorkMinutes * 60 * 1000;
    return;
  }

  if (now < pomodoroEndsAt.value) {
    return;
  }

  if (now - lastPomodoroMessageAt.value < 10_000) {
    return;
  }
  lastPomodoroMessageAt.value = now;

  if (pomodoroPhase.value === 'work') {
    pomodoroPhase.value = 'break';
    pomodoroEndsAt.value = now + settings.pomodoroBreakMinutes * 60 * 1000;
    await emitInsight(
      'pomodoro-complete',
      localizedMessage(
        settings,
        'Focus block complete. Time for a short break.',
        '专注阶段已完成，可以休息一下了。',
      ),
      'Pomodoro work phase completed.',
    );
    return;
  }

  pomodoroPhase.value = 'work';
  pomodoroEndsAt.value = now + settings.pomodoroWorkMinutes * 60 * 1000;
  await emitInsight(
    'pomodoro-restart',
    localizedMessage(
      settings,
      'Break finished. Ready for the next focus block.',
      '休息结束，准备进入下一轮专注。',
    ),
    'Pomodoro break phase completed.',
  );
}

async function syncRelationshipState(): Promise<void> {
  const nextState = await runtime.memory.getRelationshipState();
  relationshipState.value = nextState;
  if (isTauriRuntime()) {
    await emitRuntimeEvent('relationship-state', nextState);
  }
}

export const useDesktopServicesStore = defineStore('desktopServices', () => {
  function registerHandlers(nextHandlers: DesktopServiceHandlers) {
    desktopHandlers = nextHandlers;
  }

  async function runDesktopOrganizerNow(
    path?: string,
    createFolders = true,
  ): Promise<OrganizeDirectoryResponse> {
    return organizeDirectory({
      path,
      createFolders,
    });
  }

  async function runBatchRenameNow(
    directory: string,
    pattern: string,
  ): Promise<BatchRenameResponse> {
    return batchRenameFiles({
      directory,
      pattern,
    });
  }

  async function tick() {
    const settings = getSettings();
    await tickPomodoro(settings);
    await tickClipboard(settings);
    await tickAutoOrganizer(settings);

    const now = Date.now();
    if (now - lastHardwarePollAt >= 30_000) {
      lastHardwarePollAt = now;
      await tickHardware(settings);
    }

    if (
      settings.affectionSystemEnabled &&
      settings.userProfileEnabled &&
      now - lastRelationshipSyncAt >= 45_000
    ) {
      lastRelationshipSyncAt = now;
      await syncRelationshipState();
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
    }, Math.max(1000, getSettings().clipboardPollingIntervalMs));
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
    lastClipboardText,
    lastClipboardAt,
    lastSystemMetrics,
    lastInsightMessage,
    lastWarningMessage,
    relationshipState,
    pomodoroPhase,
    pomodoroEndsAt,
    start,
    stop,
    tick,
    registerHandlers,
    runDesktopOrganizerNow,
    runBatchRenameNow,
    syncRelationshipState,
  };
});
