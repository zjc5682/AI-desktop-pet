export interface ModelConfig {
  name: string;
  path: string;
  author?: string;
  description?: string;
}

export interface AppSettings {
  selectedModel: string;
  alwaysOnTop: boolean;
  showMessages: boolean;
  idleDetection: boolean;
  idleTime: number;
}

export type UiLanguage = 'en' | 'zh-CN';

export interface CompanionSettings {
  defaultChatProvider: string;
  defaultTtsProvider: string;
  searchEnabled: boolean;
  voiceEnabled: boolean;
  safeModeEnabled: boolean;
  activeCharacterId: string;
  uiLanguage: UiLanguage;
  chatBackendUrl: string;
  ollamaUrl: string;
  ollamaModel: string;
  chatTemperature: number;
  chatMaxTokens: number;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  zhipuBaseUrl: string;
  zhipuApiKey: string;
  zhipuModel: string;
  qwenLocalModelPath: string;
  qwenLocalContextSize: number;
  qwenLocalThreads: number;
  qwenLocalGpuLayers: number;
  searchProvider: string;
  searchMaxResults: number;
  wakeWordEnabled: boolean;
  wakeWord: string;
  fullDuplexVoiceEnabled: boolean;
  allowVoiceInterrupt: boolean;
  autoStartMicrophone: boolean;
  vadProvider: string;
  sttProvider: string;
  speechLanguage: string;
  ttsVoice: string;
  audioCaptureBackend: string;
  voiceEmotionEnabled: boolean;
  voiceEmotionProvider: string;
  voiceEmotionModelPath: string;
  vibeVoiceAsrUrl: string;
  vibeVoiceTtsUrl: string;
  gptSovitsUrl: string;
  gptSovitsReferenceAudio: string;
  gptSovitsPromptText: string;
  gptSovitsPromptLanguage: string;
  cameraEnabled: boolean;
  visionBackend: string;
  faceDetectionEnabled: boolean;
  expressionRecognitionEnabled: boolean;
  expressionModelPath: string;
  gazeTrackingEnabled: boolean;
  gestureRecognitionEnabled: boolean;
  cameraPreviewEnabled: boolean;
  cameraPreviewPosition: string;
  videoCallEnabled: boolean;
  empathySyncEnabled: boolean;
  virtualBackgroundMode: string;
  virtualBackgroundImage: string;
  proactiveEnabled: boolean;
  sleepReminderEnabled: boolean;
  awayDetectionEnabled: boolean;
  awayReminderMinutes: number;
  memoryReminderEnabled: boolean;
  clipboardWatcherEnabled: boolean;
  clipboardCodeInsightsEnabled: boolean;
  clipboardLinkSummaryEnabled: boolean;
  clipboardErrorAnalysisEnabled: boolean;
  clipboardPollingIntervalMs: number;
  desktopOrganizerEnabled: boolean;
  desktopOrganizerPath: string;
  desktopOrganizerAutoFolders: boolean;
  batchRenameEnabled: boolean;
  batchRenameDirectory: string;
  batchRenamePattern: string;
  pomodoroEnabled: boolean;
  pomodoroWorkMinutes: number;
  pomodoroBreakMinutes: number;
  focusQuietModeEnabled: boolean;
  hardwareMonitoringEnabled: boolean;
  cpuUsageAlertThreshold: number;
  memoryUsageAlertThreshold: number;
  cpuTemperatureAlertThreshold: number;
  batteryLowThreshold: number;
  bossKeyShortcut: string;
  voiceRecordShortcut: string;
  screenshotTranslateShortcut: string;
  affectionSystemEnabled: boolean;
  emotionStateEnabled: boolean;
  userProfileEnabled: boolean;
}

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export type EventSource =
  | 'ui'
  | 'audio'
  | 'vision'
  | 'screen'
  | 'clipboard'
  | 'game'
  | 'system'
  | 'plugin';

export interface CompanionEvent<TPayload = unknown> {
  id: string;
  type: string;
  source: EventSource;
  ts: number;
  payload: TPayload;
  sessionId?: string;
  userId?: string;
}

export type PermissionName =
  | 'camera'
  | 'microphone'
  | 'screen'
  | 'clipboard'
  | 'search'
  | 'automation'
  | 'filesystem'
  | 'gameControl';

export type PermissionDecision = 'granted' | 'denied' | 'prompt';

export type PermissionState = Record<PermissionName, PermissionDecision>;

export type EmbeddingVector = number[];

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  score?: number;
}

export interface DesktopPetSettings {
  enableChat: boolean;
  showMessages: boolean;
  alwaysOnTop: boolean;
  idleDetection: boolean;
  idleTime: number;
  useDefaultModel: boolean;
  selectedModel: string | null;
}

export const DESKTOP_PET_SETTINGS_STORAGE_KEY = 'petSettings';
export const COMPANION_SETTINGS_STORAGE_KEY = 'companionSettings';

const DEFAULT_WAKE_WORD = '\u5c0f\u684c';

function isCorruptedWakeWord(value: string): boolean {
  const corruptionMarkers = ['鐏', '閻', '灏', '顢', '绻'];
  return corruptionMarkers.some((marker) => value.includes(marker));
}
const INVALID_WAKE_WORDS = new Set(['灏忔', '鐏忓繑顢?)']);

export const DEFAULT_SETTINGS: AppSettings = {
  selectedModel: 'histoire',
  alwaysOnTop: true,
  showMessages: true,
  idleDetection: true,
  idleTime: 30,
};

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  defaultChatProvider: 'ollama',
  defaultTtsProvider: 'edge-tts',
  searchEnabled: false,
  voiceEnabled: false,
  safeModeEnabled: true,
  activeCharacterId: 'default',
  uiLanguage: 'en',
  chatBackendUrl: 'ws://127.0.0.1:8766',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'qwen2.5:7b',
  chatTemperature: 0.7,
  chatMaxTokens: 2048,
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiApiKey: '',
  openaiModel: 'gpt-4.1-mini',
  zhipuBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  zhipuApiKey: '',
  zhipuModel: 'glm-4.5-air',
  qwenLocalModelPath: 'models/qwen.gguf',
  qwenLocalContextSize: 4096,
  qwenLocalThreads: 4,
  qwenLocalGpuLayers: 0,
  searchProvider: 'duckduckgo',
  searchMaxResults: 5,
  wakeWordEnabled: false,
  wakeWord: DEFAULT_WAKE_WORD,
  fullDuplexVoiceEnabled: false,
  allowVoiceInterrupt: true,
  autoStartMicrophone: false,
  vadProvider: 'silero-vad',
  sttProvider: 'faster-whisper',
  speechLanguage: 'zh',
  ttsVoice: 'zh-CN-XiaoxiaoNeural',
  audioCaptureBackend: 'rust',
  voiceEmotionEnabled: false,
  voiceEmotionProvider: 'wav2vec2',
  voiceEmotionModelPath: '',
  vibeVoiceAsrUrl: '',
  vibeVoiceTtsUrl: '',
  gptSovitsUrl: '',
  gptSovitsReferenceAudio: '',
  gptSovitsPromptText: '',
  gptSovitsPromptLanguage: 'zh',
  cameraEnabled: false,
  visionBackend: 'mediapipe-opencv',
  faceDetectionEnabled: true,
  expressionRecognitionEnabled: true,
  expressionModelPath: 'models/vision/emotion-ferplus/model.onnx',
  gazeTrackingEnabled: true,
  gestureRecognitionEnabled: false,
  cameraPreviewEnabled: true,
  cameraPreviewPosition: 'bottom-left',
  videoCallEnabled: true,
  empathySyncEnabled: true,
  virtualBackgroundMode: 'none',
  virtualBackgroundImage: '',
  proactiveEnabled: true,
  sleepReminderEnabled: true,
  awayDetectionEnabled: true,
  awayReminderMinutes: 5,
  memoryReminderEnabled: true,
  clipboardWatcherEnabled: true,
  clipboardCodeInsightsEnabled: true,
  clipboardLinkSummaryEnabled: true,
  clipboardErrorAnalysisEnabled: true,
  clipboardPollingIntervalMs: 2500,
  desktopOrganizerEnabled: false,
  desktopOrganizerPath: '',
  desktopOrganizerAutoFolders: true,
  batchRenameEnabled: false,
  batchRenameDirectory: '',
  batchRenamePattern: '{date}-{index}-{stem}',
  pomodoroEnabled: false,
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  focusQuietModeEnabled: true,
  hardwareMonitoringEnabled: true,
  cpuUsageAlertThreshold: 92,
  memoryUsageAlertThreshold: 90,
  cpuTemperatureAlertThreshold: 88,
  batteryLowThreshold: 20,
  bossKeyShortcut: 'Alt+Shift+X',
  voiceRecordShortcut: 'Alt+Shift+V',
  screenshotTranslateShortcut: 'Alt+Shift+S',
  affectionSystemEnabled: true,
  emotionStateEnabled: true,
  userProfileEnabled: true,
};

export const DEFAULT_PERMISSION_STATE: PermissionState = {
  camera: 'prompt',
  microphone: 'prompt',
  screen: 'prompt',
  clipboard: 'prompt',
  search: 'prompt',
  automation: 'prompt',
  filesystem: 'prompt',
  gameControl: 'prompt',
};

export const DEFAULT_DESKTOP_PET_SETTINGS: DesktopPetSettings = {
  enableChat: false,
  showMessages: true,
  alwaysOnTop: true,
  idleDetection: true,
  idleTime: 30,
  useDefaultModel: true,
  selectedModel: null,
};

export function loadSettings(): AppSettings {
  const saved = localStorage.getItem('petSettings');
  if (saved) {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = loadSettings();
  localStorage.setItem('petSettings', JSON.stringify({ ...current, ...settings }));
}

function normalizeWakeWord(value: string | null | undefined): string {
  const wakeWord = String(value ?? '').trim();

  if (
    !wakeWord ||
    INVALID_WAKE_WORDS.has(wakeWord) ||
    isCorruptedWakeWord(wakeWord)
  ) {
    return DEFAULT_WAKE_WORD;
  }

  return wakeWord;
}

function normalizeUiLanguage(value: string | null | undefined): UiLanguage {
  return value === 'zh-CN' ? 'zh-CN' : 'en';
}

function normalizeAudioCaptureBackend(value: string | null | undefined): string {
  return value === 'rust' ? 'rust' : 'rust';
}

function normalizeCompanionSettings(
  settings: CompanionSettings,
): CompanionSettings {
  return {
    ...settings,
    uiLanguage: normalizeUiLanguage(settings.uiLanguage),
    wakeWord: normalizeWakeWord(settings.wakeWord),
    audioCaptureBackend: normalizeAudioCaptureBackend(settings.audioCaptureBackend),
  };
}

export function loadCompanionSettings(): CompanionSettings {
  const saved = localStorage.getItem(COMPANION_SETTINGS_STORAGE_KEY);
  if (saved) {
    return normalizeCompanionSettings({
      ...DEFAULT_COMPANION_SETTINGS,
      ...JSON.parse(saved),
    });
  }
  return normalizeCompanionSettings({ ...DEFAULT_COMPANION_SETTINGS });
}

export function saveCompanionSettings(
  settings: Partial<CompanionSettings>,
): CompanionSettings {
  const current = loadCompanionSettings();
  const next = normalizeCompanionSettings({ ...current, ...settings });
  localStorage.setItem(COMPANION_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadDesktopPetSettings(): DesktopPetSettings {
  const saved = localStorage.getItem(DESKTOP_PET_SETTINGS_STORAGE_KEY);
  if (saved) {
    return { ...DEFAULT_DESKTOP_PET_SETTINGS, ...JSON.parse(saved) };
  }
  return { ...DEFAULT_DESKTOP_PET_SETTINGS };
}

export function saveDesktopPetSettings(
  settings: Partial<DesktopPetSettings>,
): DesktopPetSettings {
  const next = { ...loadDesktopPetSettings(), ...settings };
  localStorage.setItem(DESKTOP_PET_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  return next;
}
