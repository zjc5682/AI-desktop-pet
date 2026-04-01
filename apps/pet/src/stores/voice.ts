import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ref } from 'vue';
import { loadCompanionSettings, type CompanionSettings } from '@table-pet/shared';
import { getDesktopCompanionRuntime } from '../companion/runtime';
import { localizeRuntimeText, normalizeUiLanguage } from '../i18n/runtimeLocale';
import { ensureBackendService } from '../utils/desktopCommands';

type VoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

interface VoiceCommandHandlers {
  openChat?: () => void | Promise<void>;
  openSettings?: () => void | Promise<void>;
  toggleSleep?: () => void | Promise<void>;
  wake?: () => void | Promise<void>;
}

interface VoiceVadState {
  active: boolean;
  confidence: number;
  provider: string;
  updatedAt: number;
}

interface VoiceEmotionState {
  emotion: 'calm' | 'happy' | 'angry' | 'sad' | 'excited' | 'unknown';
  confidence: number;
  provider: string;
  updatedAt: number;
}

interface VoiceTranscriptState {
  text: string;
  stableText: string;
  unstableText: string;
  revision: number;
  audioMs: number;
  stableAudioMs: number;
  provider: string;
  strategy: string;
  isFinal: boolean;
  updatedAt: number;
}

interface VoiceProviderDiagnostic {
  kind: string;
  requested: string;
  resolved: string;
  available: boolean;
  reason: string;
  target: string;
  metadata?: Record<string, unknown>;
}

interface VoiceProviderDiagnostics {
  vad?: VoiceProviderDiagnostic;
  stt?: VoiceProviderDiagnostic;
  tts?: VoiceProviderDiagnostic;
  voiceEmotion?: VoiceProviderDiagnostic;
}

interface NativeVoiceCaptureChunkEvent {
  pcmBase64?: string;
  sampleRate?: number;
  channels?: number;
  captureBackend?: string;
}

interface NativeVoiceCaptureErrorEvent {
  message?: string;
}

interface NativeVoiceCaptureSessionInfo {
  captureBackend?: string;
  sampleRate?: number;
  channels?: number;
  chunkMillis?: number;
  deviceName?: string;
}

interface NativeVoicePlaybackChunkResponse {
  playbackBackend?: string;
  token?: number;
}

interface NativeVoicePlaybackFinishedEvent {
  playbackBackend?: string;
  token?: number;
}

interface NativeVoicePlaybackErrorEvent {
  message?: string;
  token?: number;
  playbackBackend?: string;
}

type NativeCaptureUnlisten = () => void;

interface PlaybackQueueItem {
  audioBase64: string;
  mimeType: string;
  audioFormat?: string;
  sampleRate?: number;
}

interface CaptureQueueItem {
  pcmBase64: string;
  sampleRate: number;
  channels: number;
  captureBackend: string;
}

type VoiceSocketMessage =
  | {
      type: 'voice_session_ready';
      sessionId?: string;
      vadProvider?: string;
      sttProvider?: string;
      ttsProvider?: string;
      wakeWordEnabled?: boolean;
      voiceEmotionEnabled?: boolean;
      voiceEmotionProvider?: string;
      voiceEmotionAvailable?: boolean;
      providerDiagnostics?: VoiceProviderDiagnostics;
      providerIssues?: string[];
    }
  | { type: 'voice_state'; state?: VoiceStatus }
  | { type: 'voice_vad_state'; active?: boolean; confidence?: number; provider?: string }
  | {
      type: 'voice_emotion_state';
      emotion?: VoiceEmotionState['emotion'];
      confidence?: number;
      provider?: string;
    }
  | {
      type: 'voice_partial_transcript';
      text?: string;
      stableText?: string;
      unstableText?: string;
      revision?: number;
      audioMs?: number;
      stableAudioMs?: number;
      provider?: string;
      strategy?: string;
    }
  | {
      type: 'voice_final_transcript';
      text?: string;
      stableText?: string;
      unstableText?: string;
      revision?: number;
      audioMs?: number;
      stableAudioMs?: number;
      provider?: string;
      strategy?: string;
    }
  | { type: 'voice_wake_word_detected'; text?: string }
  | { type: 'voice_assistant_text_chunk'; text?: string }
  | { type: 'voice_assistant_text'; text?: string }
  | {
      type: 'voice_tts_audio';
      audioBase64?: string;
      mimeType?: string;
      audioFormat?: string;
      sampleRate?: number;
      state?: VoiceStatus;
    }
  | {
      type: 'voice_tts_audio_chunk';
      audioBase64?: string;
      mimeType?: string;
      audioFormat?: string;
      sampleRate?: number;
      state?: VoiceStatus;
    }
  | { type: 'voice_tts_audio_end' }
  | { type: 'voice_interrupt_playback' }
  | { type: 'voice_error'; message?: string };

const runtime = getDesktopCompanionRuntime();
const status = ref<VoiceStatus>('idle');
const errorMessage = ref('');
const isActive = ref(false);
const lastTranscript = ref('');
const lastTranscriptState = ref<VoiceTranscriptState | null>(null);
const lastAssistantText = ref('');
const lastWakeWordEvent = ref('');
const lastVadState = ref<VoiceVadState | null>(null);
const lastVoiceEmotion = ref<VoiceEmotionState | null>(null);
const activeVadProvider = ref('');
const activeSttProvider = ref('');
const activeTtsProvider = ref('');
const activeVoiceEmotionProvider = ref('');
const activeCaptureBackend = ref('');
const isVoiceEmotionAvailable = ref(false);
const providerDiagnostics = ref<VoiceProviderDiagnostics>({});
const providerIssues = ref<string[]>([]);
const probeStatus = ref<'idle' | 'probing' | 'ready' | 'error'>('idle');
const probeErrorMessage = ref('');
const lastProbeAt = ref(0);
const captureOverflowCount = ref(0);
const lastCaptureOverflowAt = ref(0);

const DEFAULT_SESSION_ID = 'default';
const LOW_LATENCY_CAPTURE_CHUNK_MS = 24;
const DEFAULT_CAPTURE_CHUNK_MS = 32;
const MAX_CAPTURE_SOCKET_BUFFERED_BYTES = 512 * 1024;
const MAX_CAPTURE_QUEUE_CHUNKS = 48;
const CAPTURE_QUEUE_DRAIN_INTERVAL_MS = 12;
const NATIVE_PLAYBACK_BACKEND = 'rust-rodio';
const VOICE_SOCKET_CONNECT_RETRY_ATTEMPTS = 3;
const VOICE_SOCKET_CONNECT_RETRY_DELAY_MS = 450;

let commandHandlers: VoiceCommandHandlers = {};
let socket: WebSocket | null = null;
let playbackContext: AudioContext | null = null;
let playbackQueue: PlaybackQueueItem[] = [];
let playbackDrainPromise: Promise<void> | null = null;
let playbackStreamEnded = false;
let playbackGeneration = 0;
let playbackScheduledUntil = 0;
const playbackSourceNodes = new Set<AudioBufferSourceNode>();
let nativeCaptureChunkUnlisten: NativeCaptureUnlisten | null = null;
let nativeCaptureErrorUnlisten: NativeCaptureUnlisten | null = null;
let nativePlaybackFinishedUnlisten: NativeCaptureUnlisten | null = null;
let nativePlaybackErrorUnlisten: NativeCaptureUnlisten | null = null;
let lastCompanionSettings: CompanionSettings = loadCompanionSettings();
let playbackMode: 'none' | 'web-audio' | 'native-rust' = 'none';
let nativePlaybackToken: number | null = null;
let nativePlaybackGeneration = 0;
let captureSendQueue: CaptureQueueItem[] = [];
let captureDrainTimer: number | null = null;

function setStatus(next: VoiceStatus) {
  status.value = next;
}

function normalizeBackendUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed || 'ws://127.0.0.1:8766';
}

function localizeMessage(message: string) {
  const locale = normalizeUiLanguage(loadCompanionSettings().uiLanguage);
  if (locale === 'zh-CN') {
    if (message === 'Unable to start the local backend service.') {
      return '无法启动本地后端服务。';
    }
    if (
      /^Voice STT is unavailable: No local faster-whisper model was found\..*$/.test(
        message,
      )
    ) {
      return '语音 STT 当前不可用：没有找到本地 faster-whisper 模型。请在设置页填写本地 CTranslate2 模型目录，或先把模型放到本机 Hugging Face 缓存。';
    }
    if (message === 'Voice websocket connection failed.') {
      return '语音会话连接本地后端失败。';
    }
    if (message === 'Voice websocket connection closed before it was ready.') {
      return '语音会话在初始化完成前就断开了，请检查本地后端日志。';
    }
    if (message === 'Voice session timed out before the backend became ready.') {
      return '语音会话等待后端初始化超时。';
    }
    if (
      /^Voice pipeline failed: STT provider whisper failed: \[WinError 2\]/.test(
        message,
      )
    ) {
      return 'Whisper 本地转写依赖缺失。当前版本已改为优先走内存 PCM 转写，请重启后端后重试。';
    }
  }
  return localizeRuntimeText(locale, message);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableSocketStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return [
    'Voice websocket connection failed.',
    'Voice websocket connection closed before it was ready.',
    'Voice session timed out before the backend became ready.',
    'Unable to reach the voice websocket backend.',
    'Voice runtime probe closed before the backend replied.',
    'TTS preview websocket failed.',
    'TTS preview websocket closed before audio arrived.',
  ].includes(message);
}

async function withVoiceSocketStartupRetries<T>(
  settings: CompanionSettings,
  task: () => Promise<T>,
): Promise<T> {
  let lastError: unknown = null;

  for (
    let attemptIndex = 0;
    attemptIndex < VOICE_SOCKET_CONNECT_RETRY_ATTEMPTS;
    attemptIndex += 1
  ) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const shouldRetry =
        attemptIndex + 1 < VOICE_SOCKET_CONNECT_RETRY_ATTEMPTS &&
        isRetryableSocketStartupError(error);
      if (!shouldRetry) {
        throw error;
      }

      await sleep(VOICE_SOCKET_CONNECT_RETRY_DELAY_MS * (attemptIndex + 1));
      await ensureVoiceBackendReady(settings);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Voice websocket connection failed.');
}

function getPreferredCaptureChunkMillis(settings: CompanionSettings) {
  return settings.fullDuplexVoiceEnabled
    ? LOW_LATENCY_CAPTURE_CHUNK_MS
    : DEFAULT_CAPTURE_CHUNK_MS;
}

function getVoiceSessionConfig(settings: CompanionSettings) {
  return {
    sessionId: DEFAULT_SESSION_ID,
    wakeWordEnabled: settings.wakeWordEnabled,
    wakeWord: settings.wakeWord,
    fullDuplexEnabled: settings.fullDuplexVoiceEnabled,
    allowInterrupt: settings.allowVoiceInterrupt,
    vadProvider: settings.vadProvider,
    sttProvider: settings.sttProvider,
    sttModelPath: settings.sttModelPath,
    sttModelSize: settings.sttModelSize,
    ttsProvider: settings.defaultTtsProvider,
    speechLanguage: settings.speechLanguage,
    ttsVoice: settings.ttsVoice,
    voiceEmotionEnabled: settings.voiceEmotionEnabled,
    voiceEmotionProvider: settings.voiceEmotionProvider,
    voiceEmotionModelPath: settings.voiceEmotionModelPath,
    vibeVoiceAsrUrl: settings.vibeVoiceAsrUrl,
    vibeVoiceTtsUrl: settings.vibeVoiceTtsUrl,
    gptSovitsUrl: settings.gptSovitsUrl,
    gptSovitsReferenceAudio: settings.gptSovitsReferenceAudio,
    gptSovitsPromptText: settings.gptSovitsPromptText,
    gptSovitsPromptLanguage: settings.gptSovitsPromptLanguage,
    defaultChatProvider: settings.defaultChatProvider,
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
    chatTemperature: settings.chatTemperature,
    chatMaxTokens: settings.chatMaxTokens,
  };
}

async function ensureVoiceBackendReady(settings: CompanionSettings) {
  await ensureBackendService({
    backendUrl: settings.chatBackendUrl,
    timeoutMs: 12000,
  });
}

function applySessionReadyPayload(
  payload: Extract<VoiceSocketMessage, { type: 'voice_session_ready' }>,
) {
  activeVadProvider.value = payload.vadProvider ?? '';
  activeSttProvider.value = payload.sttProvider ?? '';
  activeTtsProvider.value = payload.ttsProvider ?? '';
  activeVoiceEmotionProvider.value = payload.voiceEmotionProvider ?? '';
  isVoiceEmotionAvailable.value = Boolean(payload.voiceEmotionAvailable);
  providerDiagnostics.value = payload.providerDiagnostics ?? {};
  providerIssues.value = Array.isArray(payload.providerIssues)
    ? payload.providerIssues.filter((item): item is string => typeof item === 'string')
    : [];
}

function getFatalVoiceSessionIssue(
  payload: Extract<VoiceSocketMessage, { type: 'voice_session_ready' }>,
) {
  const diagnostics = payload.providerDiagnostics;
  const sttDiagnostic = diagnostics?.stt;
  if (sttDiagnostic && sttDiagnostic.available === false) {
    const reason = String(sttDiagnostic.reason ?? '').trim();
    if (reason) {
      return `Voice STT is unavailable: ${reason}`;
    }
    return 'Voice STT is unavailable.';
  }

  return '';
}

function stripTranscriptPrefix(text: string, prefix: string) {
  const normalizedText = text.trim();
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix || !normalizedText) {
    return normalizedText;
  }
  if (normalizedText === normalizedPrefix) {
    return '';
  }
  if (normalizedText.startsWith(normalizedPrefix)) {
    return normalizedText.slice(normalizedPrefix.length).trim();
  }

  const wordText = normalizedText.split(/\s+/);
  const wordPrefix = normalizedPrefix.split(/\s+/);
  if (
    wordPrefix.length > 0 &&
    wordPrefix.length <= wordText.length &&
    wordText.slice(0, wordPrefix.length).join(' ') === wordPrefix.join(' ')
  ) {
    return wordText.slice(wordPrefix.length).join(' ').trim();
  }

  return normalizedText;
}

function buildTranscriptState(
  payload: Extract<
    VoiceSocketMessage,
    { type: 'voice_partial_transcript' | 'voice_final_transcript' }
  >,
  isFinal = false,
): VoiceTranscriptState | null {
  const text = String(payload.text ?? '').trim();
  if (!text) {
    return null;
  }

  const stableText = String(payload.stableText ?? (isFinal ? text : '')).trim();
  const unstableText = String(
    payload.unstableText ?? (isFinal ? '' : stripTranscriptPrefix(text, stableText)),
  ).trim();

  return {
    text,
    stableText,
    unstableText,
    revision: Number(payload.revision ?? 0),
    audioMs: Number(payload.audioMs ?? 0),
    stableAudioMs: Number(payload.stableAudioMs ?? 0),
    provider: String(payload.provider ?? ''),
    strategy: String(payload.strategy ?? ''),
    isFinal,
    updatedAt: Date.now(),
  };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isPcm16Audio(mimeType = 'audio/mpeg', audioFormat = '') {
  const normalizedFormat = audioFormat.trim().toLowerCase();
  return (
    normalizedFormat === 'pcm16' ||
    mimeType.trim().toLowerCase().startsWith('audio/pcm')
  );
}

function resetNativePlaybackState() {
  nativePlaybackToken = null;
  nativePlaybackGeneration = 0;
  if (playbackMode === 'native-rust') {
    playbackMode = 'none';
  }
}

async function saveVoiceTurn(role: 'user' | 'assistant', content: string) {
  await runtime.memory.saveMessage({
    id: crypto.randomUUID(),
    sessionId: DEFAULT_SESSION_ID,
    role,
    content,
    createdAt: new Date().toISOString(),
    metadata: {
      source: 'voice',
    },
  });
}

function interpretLocalCommand(text: string): keyof VoiceCommandHandlers | null {
  const normalized = text.replace(/\s+/g, '');
  if (normalized.includes('打开设置') || normalized.includes('打开设定')) {
    return 'openSettings';
  }

  if (normalized.includes('打开聊天') || normalized.includes('打开对话')) {
    return 'openChat';
  }

  if (normalized.includes('睡觉') || normalized.includes('休眠')) {
    return 'toggleSleep';
  }

  if (normalized.includes('醒来') || normalized.includes('起床')) {
    return 'wake';
  }

  if (normalized.includes('打开设置') || normalized.includes('打开设定')) {
    return 'openSettings';
  }

  if (normalized.includes('打开聊天') || normalized.includes('打开对话')) {
    return 'openChat';
  }

  if (normalized.includes('睡觉') || normalized.includes('休眠')) {
    return 'toggleSleep';
  }

  if (normalized.includes('醒来') || normalized.includes('起床')) {
    return 'wake';
  }

  return null;
}

function interpretLocalCommandRuntime(text: string): keyof VoiceCommandHandlers | null {
  return interpretLocalCommandClean(text);

  const normalized = text.toLowerCase().replace(/\s+/g, '');
  const includesAny = (...phrases: string[]) =>
    phrases.some((phrase) => normalized.includes(phrase.toLowerCase().replace(/\s+/g, '')));
  if (includesAny('打开设置', '打开设定', 'open settings', 'settings')) {
    return 'openSettings';
  }

  if (includesAny('打开聊天', '打开对话', 'open chat', 'chat')) {
    return 'openChat';
  }

  if (includesAny('睡觉', '休眠', '睡眠模式', 'sleep mode', 'go to sleep', 'sleep')) {
    return 'toggleSleep';
  }

  if (includesAny('醒来', '起床', 'wake up', 'wake')) {
    return 'wake';
  }

  if (includesAny('打开设置', '打开设定', 'open settings', 'settings')) {
    return 'openSettings';
  }

  if (includesAny('打开聊天', '打开对话', 'open chat', 'chat')) {
    return 'openChat';
  }

  if (includesAny('睡觉', '休眠', 'sleep mode', 'go to sleep', 'sleep')) {
    return 'toggleSleep';
  }

  if (includesAny('醒来', '起床', 'wake up', 'wake')) {
    return 'wake';
  }

  return interpretLocalCommand(text);
}

function interpretLocalCommandClean(text: string): keyof VoiceCommandHandlers | null {
  return interpretVoiceRuntimeCommand(text);

  const normalized = text.toLowerCase().replace(/\s+/g, '');
  const includesAny = (...phrases: string[]) =>
    phrases.some((phrase) => normalized.includes(phrase.toLowerCase().replace(/\s+/g, '')));

  if (includesAny('打开设置', '打开设定', 'open settings', 'settings')) {
    return 'openSettings';
  }

  if (includesAny('打开聊天', '打开对话', 'open chat', 'chat')) {
    return 'openChat';
  }

  if (includesAny('睡觉', '休眠', '睡眠模式', 'sleep mode', 'go to sleep', 'sleep')) {
    return 'toggleSleep';
  }

  if (includesAny('醒来', '起床', 'wake up', 'wake')) {
    return 'wake';
  }

  return null;
}

function interpretVoiceRuntimeCommand(text: string): keyof VoiceCommandHandlers | null {
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  const includesAny = (...phrases: string[]) =>
    phrases.some((phrase) => normalized.includes(phrase.toLowerCase().replace(/\s+/g, '')));

  if (includesAny('打开设置', '打开设定', 'open settings', 'settings')) {
    return 'openSettings';
  }

  if (includesAny('打开聊天', '打开对话', 'open chat', 'chat')) {
    return 'openChat';
  }

  if (includesAny('睡觉', '休眠', '睡眠模式', 'sleep mode', 'go to sleep', 'sleep')) {
    return 'toggleSleep';
  }

  if (includesAny('醒来', '起床', 'wake up', 'wake')) {
    return 'wake';
  }

  return null;
}

async function executeLocalCommand(text: string) {
  const command = interpretLocalCommandRuntime(text);
  if (!command) {
    return;
  }

  const handler = commandHandlers[command];
  if (!handler) {
    return;
  }

  await handler();
}

async function getPlaybackContext() {
  if (!playbackContext || playbackContext.state === 'closed') {
    playbackContext = new AudioContext({ latencyHint: 'interactive' });
  }

  if (playbackContext.state === 'suspended') {
    await playbackContext.resume();
  }

  return playbackContext;
}

async function disposePlaybackContext() {
  const current = playbackContext;
  playbackContext = null;
  playbackScheduledUntil = 0;

  if (!current || current.state === 'closed') {
    return;
  }

  try {
    await current.close();
  } catch (error) {
    console.warn('Failed to close playback audio context.', error);
  }
}

function notifyPlaybackFinishedIfReady(generation = playbackGeneration) {
  if (playbackMode === 'native-rust') {
    return;
  }

  if (generation !== playbackGeneration) {
    return;
  }

  if (!playbackStreamEnded || playbackQueue.length > 0 || playbackSourceNodes.size > 0) {
    return;
  }

  playbackStreamEnded = false;
  playbackScheduledUntil = 0;
  playbackMode = 'none';
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'voice_playback_finished' }));
  }
}

async function stopPlayback(notifyBackend = true) {
  playbackGeneration += 1;
  await stopNativePlayback();
  playbackQueue = [];
  playbackStreamEnded = false;
  playbackDrainPromise = null;
  playbackScheduledUntil = 0;

  for (const sourceNode of playbackSourceNodes) {
    try {
      sourceNode.onended = null;
      sourceNode.stop();
      sourceNode.disconnect();
    } catch {
      continue;
    }
  }
  playbackSourceNodes.clear();
  playbackMode = 'none';
  await disposePlaybackContext();

  if (notifyBackend && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'voice_playback_finished' }));
  }
}

async function playAudioChunk(
  base64Audio: string,
  mimeType = 'audio/mpeg',
  audioFormat = '',
  sampleRate = 24000,
  generation = playbackGeneration,
) {
  if (generation !== playbackGeneration) {
    return false;
  }

  try {
    const context = await getPlaybackContext();
    const bytes = base64ToUint8Array(base64Audio);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const normalizedFormat = audioFormat.trim().toLowerCase();
    const isPcm16 = isPcm16Audio(mimeType, normalizedFormat);

    let decodedBuffer: AudioBuffer;
    if (isPcm16) {
      const sampleCount = Math.floor(bytes.byteLength / 2);
      const pcmSamples = new Int16Array(arrayBuffer, 0, sampleCount);
      decodedBuffer = context.createBuffer(1, sampleCount, Math.max(1, sampleRate));
      const channel = decodedBuffer.getChannelData(0);
      for (let index = 0; index < sampleCount; index += 1) {
        channel[index] = pcmSamples[index] / 32768;
      }
    } else {
      decodedBuffer = await context.decodeAudioData(arrayBuffer);
    }
    if (generation !== playbackGeneration) {
      return false;
    }

    const source = context.createBufferSource();
    source.buffer = decodedBuffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + 0.02, playbackScheduledUntil);
    playbackScheduledUntil = startAt + decodedBuffer.duration;
    playbackSourceNodes.add(source);

    source.onended = () => {
      playbackSourceNodes.delete(source);
      try {
        source.disconnect();
      } catch {
        return;
      } finally {
        if (playbackSourceNodes.size === 0 && playbackScheduledUntil < context.currentTime) {
          playbackScheduledUntil = context.currentTime;
        }
        notifyPlaybackFinishedIfReady(generation);
      }
    };

    source.start(startAt);
    return true;
  } catch (error) {
    errorMessage.value = localizeMessage(
      error instanceof Error ? error.message : `Unable to play TTS audio (${mimeType}).`,
    );
    setStatus('error');
    return false;
  }
}

async function drainPlaybackQueue(generation = playbackGeneration) {
  if (generation !== playbackGeneration) {
    return;
  }

  if (playbackDrainPromise) {
    await playbackDrainPromise;
    return;
  }

  const drainPromise = (async () => {
    while (generation === playbackGeneration) {
      const nextChunk = playbackQueue.shift();
      if (!nextChunk) {
        break;
      }

      const played = await playAudioChunk(
        nextChunk.audioBase64,
        nextChunk.mimeType,
        nextChunk.audioFormat,
        nextChunk.sampleRate,
        generation,
      );
      if (!played) {
        break;
      }
    }
  })();

  playbackDrainPromise = drainPromise;
  try {
    await drainPromise;
  } finally {
    if (playbackDrainPromise === drainPromise) {
      playbackDrainPromise = null;
    }
    notifyPlaybackFinishedIfReady(generation);
  }
}

function enqueuePlaybackChunk(
  base64Audio: string,
  mimeType = 'audio/mpeg',
  audioFormat = '',
  sampleRate = 24000,
) {
  playbackMode = 'web-audio';
  playbackQueue.push({
    audioBase64: base64Audio,
    mimeType,
    audioFormat,
    sampleRate,
  });
  void drainPlaybackQueue(playbackGeneration);
}

function clearCaptureSendQueue() {
  captureSendQueue = [];
  if (captureDrainTimer !== null) {
    window.clearTimeout(captureDrainTimer);
    captureDrainTimer = null;
  }
}

function scheduleCaptureQueueDrain() {
  if (captureDrainTimer !== null) {
    return;
  }

  captureDrainTimer = window.setTimeout(() => {
    captureDrainTimer = null;
    flushCaptureSendQueue();
    if (captureSendQueue.length > 0) {
      scheduleCaptureQueueDrain();
    }
  }, CAPTURE_QUEUE_DRAIN_INTERVAL_MS);
}

function notifyCaptureOverflow(droppedChunks: number) {
  if (droppedChunks <= 0) {
    return;
  }

  captureOverflowCount.value += droppedChunks;
  lastCaptureOverflowAt.value = Date.now();

  if (!isActive.value || socket?.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    socket.send(
      JSON.stringify({
        type: 'voice_capture_overflow',
        droppedChunks,
        queuedChunks: captureSendQueue.length,
      }),
    );
  } catch {
    // ignore overflow reporting failure
  }
}

function flushCaptureSendQueue() {
  if (!isActive.value || socket?.readyState !== WebSocket.OPEN) {
    clearCaptureSendQueue();
    return;
  }

  if (status.value === 'speaking' && !lastCompanionSettings.fullDuplexVoiceEnabled) {
    clearCaptureSendQueue();
    return;
  }

  while (captureSendQueue.length > 0) {
    if (socket.bufferedAmount > MAX_CAPTURE_SOCKET_BUFFERED_BYTES) {
      scheduleCaptureQueueDrain();
      return;
    }

    const nextChunk = captureSendQueue.shift();
    if (!nextChunk) {
      break;
    }

    socket.send(
      JSON.stringify({
        type: 'voice_audio_chunk',
        pcmBase64: nextChunk.pcmBase64,
        sampleRate: nextChunk.sampleRate,
        channels: nextChunk.channels,
        captureBackend: nextChunk.captureBackend,
      }),
    );
  }
}

async function replacePlaybackWithSingleAudio(
  base64Audio: string,
  mimeType = 'audio/mpeg',
  audioFormat = '',
  sampleRate = 24000,
) {
  await stopPlayback(false);
  playbackMode = 'web-audio';
  playbackQueue.push({
    audioBase64: base64Audio,
    mimeType,
    audioFormat,
    sampleRate,
  });
  playbackStreamEnded = true;
  await drainPlaybackQueue(playbackGeneration);
}

async function playPreviewTtsAudio(
  base64Audio: string,
  mimeType = 'audio/mpeg',
  audioFormat = '',
  sampleRate = 24000,
) {
  await stopPlayback(false);
  try {
    const queued = await queueNativePlaybackChunk(
      base64Audio,
      mimeType,
      audioFormat,
      sampleRate,
    );
    if (queued) {
      playbackStreamEnded = true;
      const finished = await finishNativePlayback();
      if (finished) {
        return true;
      }
      resetNativePlaybackState();
      playbackStreamEnded = false;
    }
  } catch (error) {
    console.warn('Native preview playback failed, falling back to web audio.', error);
    await stopNativePlayback();
  }

  await replacePlaybackWithSingleAudio(
    base64Audio,
    mimeType,
    audioFormat,
    sampleRate,
  );
  return true;
}

function sendPcmChunk(
  pcmBase64: string,
  sampleRate: number,
  channels: number,
  captureBackend: string,
) {
  if (!isActive.value || socket?.readyState !== WebSocket.OPEN) {
    return;
  }

  if (status.value === 'speaking' && !lastCompanionSettings.fullDuplexVoiceEnabled) {
    clearCaptureSendQueue();
    return;
  }

  captureSendQueue.push({
    pcmBase64,
    sampleRate,
    channels,
    captureBackend,
  });

  if (captureSendQueue.length > MAX_CAPTURE_QUEUE_CHUNKS) {
    const droppedChunks = captureSendQueue.length - MAX_CAPTURE_QUEUE_CHUNKS;
    captureSendQueue.splice(0, droppedChunks);
    notifyCaptureOverflow(droppedChunks);
  }

  flushCaptureSendQueue();
  if (captureSendQueue.length > 0) {
    scheduleCaptureQueueDrain();
  }
}

async function ensureNativePlaybackListeners() {
  if (!nativePlaybackFinishedUnlisten) {
    nativePlaybackFinishedUnlisten = await listen<NativeVoicePlaybackFinishedEvent>(
      'voice-playback-finished',
      (event) => {
        if (
          (event.payload?.playbackBackend ?? '').trim() !== NATIVE_PLAYBACK_BACKEND
        ) {
          return;
        }
        const token = Number(event.payload?.token ?? 0);
        if (!token || token !== nativePlaybackToken) {
          return;
        }
        if (playbackMode !== 'native-rust') {
          return;
        }
        if (nativePlaybackGeneration !== playbackGeneration) {
          return;
        }

        resetNativePlaybackState();
        playbackStreamEnded = false;
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'voice_playback_finished' }));
        }
      },
    );
  }

  if (!nativePlaybackErrorUnlisten) {
    nativePlaybackErrorUnlisten = await listen<NativeVoicePlaybackErrorEvent>(
      'voice-playback-error',
      (event) => {
        if (
          event.payload?.playbackBackend &&
          event.payload.playbackBackend.trim() !== NATIVE_PLAYBACK_BACKEND
        ) {
          return;
        }
        if (playbackMode !== 'native-rust') {
          return;
        }
        const token = Number(event.payload?.token ?? 0);
        if (token && nativePlaybackToken && token !== nativePlaybackToken) {
          return;
        }

        resetNativePlaybackState();
        errorMessage.value = localizeMessage(
          event.payload?.message ?? 'Unable to start TTS playback.',
        );
        setStatus('error');
      },
    );
  }
}

async function queueNativePlaybackChunk(
  base64Audio: string,
  mimeType = 'audio/mpeg',
  audioFormat = '',
  sampleRate = 24000,
) {
  await ensureNativePlaybackListeners();
  const payload = await invoke<NativeVoicePlaybackChunkResponse>(
    'queue_voice_playback_chunk',
    {
      request: {
        audioBase64: base64Audio,
        audioFormat,
        mimeType,
        sampleRate,
        channels: 1,
      },
    },
  );

  const token = Number(payload.token ?? 0);
  if (!token) {
    throw new Error('Native playback did not return a playback token.');
  }

  nativePlaybackToken = token;
  nativePlaybackGeneration = playbackGeneration;
  playbackMode = 'native-rust';
  return true;
}

async function finishNativePlayback() {
  if (playbackMode !== 'native-rust' || !nativePlaybackToken) {
    return false;
  }

  await invoke('finish_voice_playback', {
    request: {
      token: nativePlaybackToken,
    },
  });
  return true;
}

async function stopNativePlayback() {
  const hadNativePlayback =
    playbackMode === 'native-rust' || nativePlaybackToken !== null;
  if (!hadNativePlayback) {
    return;
  }

  resetNativePlaybackState();
  try {
    await invoke('stop_voice_playback');
  } catch (error) {
    console.warn('Failed to stop native voice playback.', error);
  }
}

async function destroyNativeAudioPipeline() {
  const unlisteners = [
    nativeCaptureChunkUnlisten,
    nativeCaptureErrorUnlisten,
    nativePlaybackFinishedUnlisten,
    nativePlaybackErrorUnlisten,
  ];
  nativeCaptureChunkUnlisten = null;
  nativeCaptureErrorUnlisten = null;
  nativePlaybackFinishedUnlisten = null;
  nativePlaybackErrorUnlisten = null;

  for (const unlisten of unlisteners) {
    try {
      unlisten?.();
    } catch (error) {
      console.warn('Failed to dispose native voice runtime listener.', error);
    }
  }

  try {
    await invoke('stop_voice_capture');
  } catch (error) {
    console.warn('Failed to stop native voice capture.', error);
  }
}

async function teardownVoiceSession(nextStatus: VoiceStatus) {
  isActive.value = false;
  clearCaptureSendQueue();

  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'voice_session_stop' }));
    } catch {
      // ignore socket shutdown races
    }
  }

  socket?.close();
  socket = null;
  await destroyNativeAudioPipeline();
  await stopPlayback(false);
  lastTranscriptState.value = null;
  lastVadState.value = null;
  lastVoiceEmotion.value = null;
  activeVadProvider.value = '';
  activeSttProvider.value = '';
  activeTtsProvider.value = '';
  activeVoiceEmotionProvider.value = '';
  activeCaptureBackend.value = '';
  isVoiceEmotionAvailable.value = false;
  providerIssues.value = [];
  captureOverflowCount.value = 0;
  lastCaptureOverflowAt.value = 0;
  setStatus(nextStatus);
}

async function startNativeAudioPipeline(settings: CompanionSettings) {
  await destroyNativeAudioPipeline();

  nativeCaptureChunkUnlisten = await listen<NativeVoiceCaptureChunkEvent>(
    'voice-capture-chunk',
    (event) => {
      const payload = event.payload;
      if (!payload?.pcmBase64) {
        return;
      }

      activeCaptureBackend.value = payload.captureBackend ?? 'rust-cpal';
      sendPcmChunk(
        payload.pcmBase64,
        Number(payload.sampleRate ?? 16000),
        Number(payload.channels ?? 1),
        payload.captureBackend ?? 'rust-cpal',
      );
    },
  );

  nativeCaptureErrorUnlisten = await listen<NativeVoiceCaptureErrorEvent>(
    'voice-capture-error',
    (event) => {
      const message = event.payload?.message ?? 'Native voice capture failed.';
      void (async () => {
        await teardownVoiceSession('error');
        errorMessage.value = localizeMessage(message);
      })();
    },
  );

  const capture = await invoke<NativeVoiceCaptureSessionInfo>('start_voice_capture', {
    config: {
      chunkMillis: getPreferredCaptureChunkMillis(settings),
    },
  });
  activeCaptureBackend.value = capture.captureBackend ?? 'rust-cpal';
}

async function startCapturePipeline(settings: CompanionSettings) {
  if (settings.audioCaptureBackend !== 'rust') {
    console.warn(
      `Unsupported audio capture backend "${settings.audioCaptureBackend}" requested; forcing desktop Rust capture.`,
    );
  }

  try {
    await startNativeAudioPipeline(settings);
  } catch (error) {
    await destroyNativeAudioPipeline();
    throw new Error(
      error instanceof Error
        ? `Desktop voice capture failed: ${error.message}`
        : 'Desktop voice capture failed.',
    );
  }
}

async function handleSocketMessage(raw: string) {
  let payload: VoiceSocketMessage;

  try {
    payload = JSON.parse(raw) as VoiceSocketMessage;
  } catch {
    return;
  }

  if (payload.type === 'voice_session_ready') {
    applySessionReadyPayload(payload);
    setStatus('listening');
    errorMessage.value = '';
    return;
  }

  if (payload.type === 'voice_state' && payload.state) {
    setStatus(payload.state);
    return;
  }

  if (payload.type === 'voice_vad_state') {
    lastVadState.value = {
      active: Boolean(payload.active),
      confidence: Number(payload.confidence ?? 0),
      provider: payload.provider ?? activeVadProvider.value,
      updatedAt: Date.now(),
    };
    return;
  }

  if (payload.type === 'voice_emotion_state' && payload.emotion) {
    lastVoiceEmotion.value = {
      emotion: payload.emotion,
      confidence: Number(payload.confidence ?? 0),
      provider: payload.provider ?? activeVoiceEmotionProvider.value,
      updatedAt: Date.now(),
    };
    return;
  }

  if (payload.type === 'voice_partial_transcript' && payload.text) {
    lastTranscript.value = payload.text;
    lastTranscriptState.value = buildTranscriptState(payload, false);
    return;
  }

  if (payload.type === 'voice_final_transcript' && payload.text) {
    lastTranscript.value = payload.text;
    lastTranscriptState.value = buildTranscriptState(payload, true);
    lastAssistantText.value = '';
    setStatus('processing');
    try {
      await saveVoiceTurn('user', payload.text);
    } catch (error) {
      console.warn('Failed to persist voice user transcript.', error);
    }
    await executeLocalCommand(payload.text);
    return;
  }

  if (payload.type === 'voice_wake_word_detected' && payload.text) {
    lastWakeWordEvent.value = payload.text;
    return;
  }

  if (payload.type === 'voice_assistant_text_chunk' && payload.text) {
    lastAssistantText.value += payload.text;
    return;
  }

  if (payload.type === 'voice_assistant_text' && payload.text) {
    lastAssistantText.value = payload.text;

    await saveVoiceTurn('assistant', payload.text);
    return;
  }

  if (payload.type === 'voice_tts_audio_chunk' && payload.audioBase64) {
    if (payload.state) {
      setStatus(payload.state);
    } else {
      setStatus('speaking');
    }

    const shouldUseNativePlayback = playbackMode !== 'web-audio';

    if (shouldUseNativePlayback) {
      try {
        const queued = await queueNativePlaybackChunk(
          payload.audioBase64,
          payload.mimeType,
          payload.audioFormat,
          payload.sampleRate,
        );
        if (queued) {
          return;
        }
      } catch (error) {
        console.warn('Native playback failed, falling back to web audio.', error);
        await stopNativePlayback();
      }
    }

    enqueuePlaybackChunk(
      payload.audioBase64,
      payload.mimeType,
      payload.audioFormat,
      payload.sampleRate,
    );
    return;
  }

  if (payload.type === 'voice_tts_audio_end') {
    if (playbackMode === 'native-rust') {
      playbackStreamEnded = true;
      try {
        const finished = await finishNativePlayback();
        if (!finished) {
          resetNativePlaybackState();
          playbackStreamEnded = false;
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'voice_playback_finished' }));
          }
        }
      } catch (error) {
        console.warn('Failed to finalize native playback.', error);
        resetNativePlaybackState();
        playbackStreamEnded = false;
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'voice_playback_finished' }));
        }
      }
      return;
    }

    playbackStreamEnded = true;
    notifyPlaybackFinishedIfReady();
    return;
  }

  if (payload.type === 'voice_tts_audio' && payload.audioBase64) {
    if (payload.state) {
      setStatus(payload.state);
    } else {
      setStatus('speaking');
    }
    await stopPlayback(false);
    try {
      const queued = await queueNativePlaybackChunk(
        payload.audioBase64,
        payload.mimeType,
        payload.audioFormat,
        payload.sampleRate,
      );
      if (queued) {
        playbackStreamEnded = true;
        const finished = await finishNativePlayback();
        if (!finished) {
          resetNativePlaybackState();
          playbackStreamEnded = false;
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'voice_playback_finished' }));
          }
        }
        return;
      }
    } catch (error) {
      console.warn('Native playback failed, falling back to web audio.', error);
      await stopNativePlayback();
    }

    await replacePlaybackWithSingleAudio(
      payload.audioBase64,
      payload.mimeType,
      payload.audioFormat,
      payload.sampleRate,
    );
    return;
  }

  if (payload.type === 'voice_interrupt_playback') {
    await stopPlayback(false);
    setStatus('listening');
    return;
  }

  if (payload.type === 'voice_error') {
    errorMessage.value = localizeMessage(payload.message ?? 'Voice session error.');
    setStatus('error');
  }
}

export const useVoiceStore = defineStore('voice', () => {
  function registerCommandHandlers(nextHandlers: VoiceCommandHandlers) {
    commandHandlers = nextHandlers;
  }

  function reloadSettings() {
    lastCompanionSettings = loadCompanionSettings();

    if (!lastCompanionSettings.voiceEnabled && isActive.value) {
      void stop();
      return lastCompanionSettings;
    }

    return lastCompanionSettings;
  }

  async function start() {
    const settings = reloadSettings();
    if (!settings.voiceEnabled) {
      errorMessage.value = localizeMessage('Voice is disabled in settings.');
      setStatus('error');
      return;
    }

    if (isActive.value) {
      return;
    }

    setStatus('connecting');
    errorMessage.value = '';
    lastTranscriptState.value = null;
    lastVadState.value = null;
    lastVoiceEmotion.value = null;
    providerIssues.value = [];
    captureOverflowCount.value = 0;
    lastCaptureOverflowAt.value = 0;

    try {
      await ensureVoiceBackendReady(settings);

      socket = await withVoiceSocketStartupRetries(settings, async () =>
        new Promise<WebSocket>((resolve, reject) => {
        const nextSocket = new WebSocket(normalizeBackendUrl(settings.chatBackendUrl));
        let settled = false;
        const readyTimeout = window.setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          try {
            nextSocket.close();
          } catch {
            // ignore close failure
          }
          reject(new Error('Voice session timed out before the backend became ready.'));
        }, 8000);

        const settle = (callback: () => void) => {
          if (settled) {
            return;
          }

          settled = true;
          window.clearTimeout(readyTimeout);
          callback();
        };

        nextSocket.onmessage = (event) => {
          const raw = String(event.data);
          try {
            const payload = JSON.parse(raw) as VoiceSocketMessage;
            if (payload.type === 'voice_session_ready') {
              applySessionReadyPayload(payload);
              const fatalIssue = getFatalVoiceSessionIssue(payload);
              if (fatalIssue) {
                settle(() => {
                  reject(new Error(fatalIssue));
                });
                return;
              }

              settle(() => {
                isActive.value = true;
                resolve(nextSocket);
              });
            } else if (payload.type === 'voice_error') {
              settle(() => {
                reject(
                  new Error(payload.message ?? 'Voice backend failed to initialize the session.'),
                );
              });
            }
          } catch {
            // ignore parse failures here; shared handler will also ignore them
          }

          void handleSocketMessage(String(event.data));
        };
        nextSocket.onopen = () => {
          clearCaptureSendQueue();
          nextSocket.send(
            JSON.stringify({
              type: 'voice_session_start',
              config: getVoiceSessionConfig(settings),
            }),
          );
        };
        nextSocket.onerror = () => {
          errorMessage.value = localizeMessage('Voice websocket connection failed.');
          setStatus('error');

          settle(() => {
            reject(new Error('Voice websocket connection failed.'));
          });
        };
        nextSocket.onclose = () => {
          clearCaptureSendQueue();
          if (!settled) {
            window.clearTimeout(readyTimeout);
            settled = true;
            reject(new Error('Voice websocket connection closed before it was ready.'));
            return;
          }

          if (isActive.value) {
            errorMessage.value ||= localizeMessage('Voice websocket disconnected.');
            setStatus('error');
          }
          isActive.value = false;
        };
        }),
      );

      await startCapturePipeline(settings);
    } catch (error) {
      await teardownVoiceSession('error');
      errorMessage.value =
        localizeMessage(
          error instanceof Error ? error.message : 'Unable to start voice session.',
        );
      setStatus('error');
    }
  }

  async function probeProviders(settingsOverride?: CompanionSettings) {
    const settings = settingsOverride ?? reloadSettings();
    probeStatus.value = 'probing';
    probeErrorMessage.value = '';
    providerDiagnostics.value = {};
    providerIssues.value = [];

    await ensureVoiceBackendReady(settings);

    return await withVoiceSocketStartupRetries(settings, async () =>
      new Promise<VoiceProviderDiagnostics>((resolve, reject) => {
      const probeSocket = new WebSocket(normalizeBackendUrl(settings.chatBackendUrl));
      let settled = false;

      const cleanup = () => {
        try {
          if (probeSocket.readyState === WebSocket.OPEN) {
            probeSocket.send(JSON.stringify({ type: 'voice_session_stop' }));
          }
        } catch {
          return;
        }
      };

      probeSocket.onopen = () => {
        probeSocket.send(
          JSON.stringify({
            type: 'voice_session_start',
            config: getVoiceSessionConfig(settings),
          }),
        );
      };

      probeSocket.onmessage = (event) => {
        let payload: VoiceSocketMessage;

        try {
          payload = JSON.parse(String(event.data)) as VoiceSocketMessage;
        } catch {
          return;
        }

        if (payload.type === 'voice_session_ready') {
          applySessionReadyPayload(payload);
          probeStatus.value = 'ready';
          probeErrorMessage.value = '';
          lastProbeAt.value = Date.now();
          cleanup();
          settled = true;
          probeSocket.close();
          resolve(providerDiagnostics.value);
          return;
        }

        if (payload.type === 'voice_error') {
          probeStatus.value = 'error';
          probeErrorMessage.value = localizeMessage(
            payload.message ?? 'Voice runtime probe failed.',
          );
          if (!settled) {
            settled = true;
            probeSocket.close();
            reject(new Error(probeErrorMessage.value));
          }
        }
      };

      probeSocket.onerror = () => {
        probeStatus.value = 'error';
        probeErrorMessage.value = localizeMessage(
          'Unable to reach the voice websocket backend.',
        );
        if (!settled) {
          settled = true;
          reject(new Error(probeErrorMessage.value));
        }
      };

      probeSocket.onclose = () => {
        if (settled) {
          return;
        }

        probeStatus.value = 'error';
        probeErrorMessage.value ||= localizeMessage(
          'Voice runtime probe closed before the backend replied.',
        );
        settled = true;
        reject(new Error(probeErrorMessage.value));
      };
      }),
    );
  }

  async function stop() {
    await teardownVoiceSession('idle');
  }

  async function toggle() {
    if (isActive.value) {
      await stop();
      return;
    }

    await start();
  }

  async function speakPreviewText(
    text: string,
    settingsOverride?: CompanionSettings,
  ): Promise<boolean> {
    const previewText = text.trim();
    if (!previewText) {
      return false;
    }

    if (isActive.value) {
      throw new Error('Stop the live voice session before previewing TTS audio.');
    }

    const settings = settingsOverride ?? reloadSettings();
    const backendUrl = normalizeBackendUrl(settings.chatBackendUrl);

    await ensureVoiceBackendReady(settings);

    return await withVoiceSocketStartupRetries(settings, async () =>
      new Promise<boolean>((resolve, reject) => {
      const previewSocket = new WebSocket(backendUrl);
      let settled = false;

      const finalize = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        callback();
        previewSocket.close();
      };

      previewSocket.onerror = () => {
        finalize(() => {
          reject(new Error('TTS preview websocket failed.'));
        });
      };

      previewSocket.onclose = () => {
        if (settled) {
          return;
        }
        finalize(() => {
          reject(new Error('TTS preview websocket closed before audio arrived.'));
        });
      };

      previewSocket.onmessage = (event) => {
        let payload: Record<string, unknown>;

        try {
          payload = JSON.parse(String(event.data ?? '{}')) as Record<string, unknown>;
        } catch {
          return;
        }

        if (payload.type === 'error' || payload.type === 'voice_error') {
          finalize(() => {
            reject(new Error(String(payload.message || 'TTS preview failed.')));
          });
          return;
        }

        if (payload.type !== 'voice_tts_audio' || typeof payload.audioBase64 !== 'string') {
          return;
        }

        const audioBase64 = payload.audioBase64;
        void (async () => {
          try {
            await playPreviewTtsAudio(
              audioBase64,
              typeof payload.mimeType === 'string' ? payload.mimeType : 'audio/mpeg',
              typeof payload.audioFormat === 'string' ? payload.audioFormat : '',
              typeof payload.sampleRate === 'number' ? payload.sampleRate : 24000,
            );
            finalize(() => {
              resolve(true);
            });
          } catch (error) {
            finalize(() => {
              reject(
                error instanceof Error
                  ? error
                  : new Error('Unable to play TTS preview.'),
              );
            });
          }
        })();
      };

      previewSocket.onopen = () => {
        previewSocket.send(
          JSON.stringify({
            type: 'tts_preview',
            text: previewText,
            config: getVoiceSessionConfig(settings),
          }),
        );
      };
      }),
    ).catch((error) => {
      errorMessage.value = localizeMessage(
        error instanceof Error ? error.message : 'TTS preview failed.',
      );
      throw error;
    });
  }

  return {
    status,
    isActive,
    errorMessage,
    lastTranscript,
    lastTranscriptState,
    lastAssistantText,
    lastWakeWordEvent,
    lastVadState,
    lastVoiceEmotion,
    activeVadProvider,
    activeSttProvider,
    activeTtsProvider,
    activeVoiceEmotionProvider,
    activeCaptureBackend,
    isVoiceEmotionAvailable,
    providerDiagnostics,
    providerIssues,
    probeStatus,
    probeErrorMessage,
    lastProbeAt,
    captureOverflowCount,
    lastCaptureOverflowAt,
    start,
    stop,
    toggle,
    speakPreviewText,
    probeProviders,
    reloadSettings,
    registerCommandHandlers,
  };
});

function disposeVoiceRuntimeForReload() {
  clearCaptureSendQueue();
  isActive.value = false;

  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // ignore close failure during reload
    }
    socket = null;
  }

  const unlisteners = [
    nativeCaptureChunkUnlisten,
    nativeCaptureErrorUnlisten,
    nativePlaybackFinishedUnlisten,
    nativePlaybackErrorUnlisten,
  ];
  nativeCaptureChunkUnlisten = null;
  nativeCaptureErrorUnlisten = null;
  nativePlaybackFinishedUnlisten = null;
  nativePlaybackErrorUnlisten = null;

  for (const unlisten of unlisteners) {
    try {
      unlisten?.();
    } catch {
      // ignore listener disposal failures during reload
    }
  }

  playbackGeneration += 1;
  playbackQueue = [];
  playbackDrainPromise = null;
  playbackStreamEnded = false;
  playbackScheduledUntil = 0;
  for (const sourceNode of playbackSourceNodes) {
    try {
      sourceNode.onended = null;
      sourceNode.stop();
      sourceNode.disconnect();
    } catch {
      // ignore node disposal failures during reload
    }
  }
  playbackSourceNodes.clear();
  playbackMode = 'none';
  resetNativePlaybackState();

  if (playbackContext) {
    const context = playbackContext;
    playbackContext = null;
    void context.close().catch(() => undefined);
  }

  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    void invoke('stop_voice_capture').catch(() => undefined);
    void invoke('stop_voice_playback').catch(() => undefined);
  }
}

function handleVoiceRuntimeBeforeUnload() {
  disposeVoiceRuntimeForReload();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', handleVoiceRuntimeBeforeUnload);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleVoiceRuntimeBeforeUnload);
    }
    disposeVoiceRuntimeForReload();
  });
}
