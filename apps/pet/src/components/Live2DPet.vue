<template>
  <div ref="containerRef" class="pet-container">
    <Live2DCanvas
      ref="canvasRef"
      :model-path="currentModel.path"
      :width="canvasWidth"
      :height="canvasHeight"
      :is-sleeping="isSleeping"
      @model-loaded="handleModelLoaded"
      @motion-played="handleMotionPlayed"
    />

    <Live2DMessage
      :show="messageState.showMessage.value"
      :text="messageState.messageText.value"
      horizontal="center"
      vertical="top"
    />

    <ControlPanel
      :is-sleeping="isSleeping"
      :show-sleep="false"
      :show-reset="false"
    >
      <template #custom-buttons>
        <button
          v-if="settingsStore.settings.enableChat"
          class="control-btn"
          :title="rt('petOpenChatTitle')"
          @click="toggleChatPanel"
        >
          {{ rt('petChatButton') }}
        </button>
        <button
          v-if="companionConfigStore.settings.videoCallEnabled"
          class="control-btn"
          :title="rt('petOpenCallTitle')"
          @click="toggleCallPanel"
        >
          {{ rt('petCallButton') }}
        </button>
        <button
          v-if="companionConfigStore.settings.voiceEnabled || voiceStore.isActive"
          :class="['control-btn', { 'is-active': voiceStore.isActive }]"
          :title="voiceStore.isActive ? rt('petStopVoiceTitle') : rt('petStartVoiceTitle')"
          @click="toggleVoiceSession"
        >
          {{ voiceStore.isActive ? rt('petMicOnButton') : rt('petMicButton') }}
        </button>
        <button
          v-if="companionConfigStore.settings.cameraEnabled || visionStore.isActive"
          :class="['control-btn', { 'is-active': visionStore.isActive }]"
          :title="visionStore.isActive ? rt('petStopVisionTitle') : rt('petStartVisionTitle')"
          @click="toggleVisionSession"
        >
          {{ visionStore.isActive ? rt('petCamOnButton') : rt('petCamButton') }}
        </button>
        <button class="control-btn" :title="rt('petOpenSettingsTitle')" @click="openSettingsWindow">
          {{ rt('petSettingsButton') }}
        </button>
      </template>
    </ControlPanel>

    <CameraPreview
      v-if="shouldShowCameraPreview"
      :stream="visionStore.previewStream"
      :position="companionConfigStore.settings.cameraPreviewPosition"
      :label="cameraPreviewLabel"
    />
  </div>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { CompanionSettings, DesktopPetSettings, UiLanguage } from '@table-pet/shared';
import { getDesktopCompanionRuntime } from '../companion/runtime';
import {
  localizeRuntimeText,
  normalizeUiLanguage,
  RUNTIME_CHARACTER_MESSAGES,
  runtimeText,
} from '../i18n/runtimeLocale';
import { useCompanionConfigStore } from '../stores/companionConfig';
import { useCompanionSettingsStore } from '../stores/companionSettings';
import { useLive2DStore } from '../stores/live2d';
import { useScreenshotTranslationStore } from '../stores/screenshotTranslation';
import { useVisionStore } from '../stores/vision';
import { useVoiceStore } from '../stores/voice';
import { useHitDetection } from '../composables/useHitDetection';
import { useIdleDetection } from '../composables/useIdleDetection';
import { useMessageSystem } from '../composables/useMessageSystem';
import { listenRuntimeEvent } from '../utils/runtimeEvents';
import CameraPreview from './CameraPreview.vue';
import ControlPanel from './Live2DPetComponents/ControlPanel.vue';
import Live2DCanvas from './Live2DPetComponents/Live2DCanvas.vue';
import Live2DMessage from './Live2DPetComponents/Live2DMessage.vue';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const BASE_WIDTH = 358;
const BASE_HEIGHT = 374;

interface ModelConfig {
  name: string;
  path: string;
  hitAreas: {
    head: { x: number[]; y: number[] };
    body: { x: number[]; y: number[] };
  };
}

const models: ModelConfig[] = [
  {
    name: 'histoire',
    path: '/models/histoire/model.json',
    hitAreas: {
      head: { x: [-0.8, 0.8], y: [0.3, -0.5] },
      body: { x: [-0.6, 0.6], y: [0.8, -0.2] },
    },
  },
];

const canvasRef = ref<InstanceType<typeof Live2DCanvas> | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const canvasWidth = ref(BASE_WIDTH);
const canvasHeight = ref(BASE_HEIGHT);
const companionConfigStore = useCompanionConfigStore();
const settingsStore = useCompanionSettingsStore();
const live2dStore = useLive2DStore();
const screenshotTranslationStore = useScreenshotTranslationStore();
const visionStore = useVisionStore();
const voiceStore = useVoiceStore();
const runtime = getDesktopCompanionRuntime();
const currentLocale = computed<UiLanguage>(() =>
  normalizeUiLanguage(companionConfigStore.settings.uiLanguage),
);
const rt = (
  key: Parameters<typeof runtimeText>[1],
  params?: Record<string, string | number>,
) => runtimeText(currentLocale.value, key, params);

const currentModel = computed(() => ({
  ...models[0],
  path: live2dStore.activeModelPath || models[0].path,
}));
const shouldShowCameraPreview = computed(
  () =>
    Boolean(
      companionConfigStore.settings.cameraEnabled &&
        companionConfigStore.settings.cameraPreviewEnabled &&
        visionStore.isActive &&
        visionStore.previewStream,
    ),
);
const cameraPreviewLabel = computed(() => {
  const backend = visionStore.backendLabel ? ` (${visionStore.backendLabel})` : '';
  if (visionStore.lastFaceState?.detected) {
    return `${rt('petCameraLabel')}${backend}`;
  }

  return `${rt('petCameraScanningLabel')}${backend}`;
});
const gestureSignature = computed(() =>
  (Array.isArray(visionStore.lastGestures) ? visionStore.lastGestures : [])
    .map((gesture) => gesture?.name ?? '')
    .filter(Boolean)
    .join(','),
);

const messageState = useMessageSystem({
  messages: RUNTIME_CHARACTER_MESSAGES[currentLocale.value],
});
const { isInHitArea, getNormalizedCoords } = useHitDetection();

let hideTimer: number | null = null;
let model: any = null;
let settingsWindow: any = null;
let chatWindow: any = null;
let callWindow: any = null;
let unlistenWindowResize: (() => void) | null = null;
let unlistenSettings: (() => void) | null = null;
let unlistenCompanionSettings: (() => void) | null = null;
let unlistenMotionPreview: (() => void) | null = null;
let unlistenExpressionPreview: (() => void) | null = null;
let unlistenProactiveReminder: (() => void) | null = null;
let unlistenDesktopInsight: (() => void) | null = null;
let unlistenDesktopWarning: (() => void) | null = null;
let unlistenRelationshipState: (() => void) | null = null;
let unlistenVoiceShortcut: (() => void) | null = null;
let unlistenScreenshotShortcut: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;
let lastRelationshipSignature = '';
let voiceShortcutOwnsSession = false;

const VOICE_RESTART_KEYS: Array<keyof CompanionSettings> = [
  'chatBackendUrl',
  'defaultChatProvider',
  'defaultTtsProvider',
  'ollamaUrl',
  'ollamaModel',
  'chatTemperature',
  'chatMaxTokens',
  'wakeWordEnabled',
  'wakeWord',
  'allowVoiceInterrupt',
  'vadProvider',
  'sttProvider',
];

const VISION_RESTART_KEYS: Array<keyof CompanionSettings> = [
  'chatBackendUrl',
  'visionBackend',
  'faceDetectionEnabled',
  'expressionRecognitionEnabled',
  'gazeTrackingEnabled',
  'gestureRecognitionEnabled',
];

const handleIdle = () => {
  messageState.showRandom(messageState.messages.idle);
};

const handleSleep = () => {
  messageState.showRandom(messageState.messages.sleepy);
};

const { isSleeping, startIdleDetection, resetIdleTimer } = useIdleDetection(
  handleIdle,
  handleSleep,
  {
    idleDelay: () => settingsStore.settings.idleTime * 1000,
    sleepDelay: 30000,
    enabled: () => settingsStore.settings.idleDetection,
  },
);

const refreshSettings = async (partial?: Partial<DesktopPetSettings>) => {
  if (partial) {
    settingsStore.applySettings(partial);
  } else {
    settingsStore.load();
  }

  messageState.setEnabled(settingsStore.settings.showMessages);
  if (!settingsStore.settings.showMessages) {
    messageState.hide();
  }

  if (!settingsStore.settings.enableChat && chatWindow) {
    chatWindow.close?.();
    chatWindow = null;
  }

  await live2dStore.loadModels();
  await live2dStore.applySelection({
    useDefaultModel: settingsStore.settings.useDefaultModel,
    selectedModel: settingsStore.settings.selectedModel,
  });
  await runtime.stage.setModel({
    name: live2dStore.currentModel ?? models[0].name,
    path: live2dStore.activeModelPath,
  });

  resetIdleTimer();

  try {
    const tauriWindow = getCurrentWindow();
    await tauriWindow.setAlwaysOnTop(settingsStore.settings.alwaysOnTop);
  } catch (error) {
    console.error('Failed to update always-on-top setting:', error);
  }
};

const setupTauriWindow = async () => {
  const isTauriApp =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  if (!isTauriApp) {
    return;
  }

  try {
    const tauriWindow = getCurrentWindow();
    unlistenWindowResize = await tauriWindow.onResized(() => {});
  } catch (error) {
    console.warn('Tauri window setup failed:', error);
  }
};

const handleModelLoaded = (loadedModel: any) => {
  model = loadedModel;
  if (canvasRef.value) {
    runtime.stage.attachCanvas(canvasRef.value);
  }
  if (settingsStore.settings.idleDetection) {
    startIdleDetection();
  }
};

const handleMotionPlayed = (motionType: string) => {
  console.log(`Motion played: ${motionType}`);
};

const formatRelationshipMessage = (payload: {
  affection: number;
  level: string;
  mood: string;
}) => {
  if (currentLocale.value === 'zh-CN') {
    return `陪伴状态：好感 ${payload.affection}，关系 ${payload.level}，心情 ${payload.mood}。`;
  }

  return `Companion bond ${payload.affection}, level ${payload.level}, mood ${payload.mood}.`;
};

const shouldRestartVoiceSession = (partial: Partial<CompanionSettings>) =>
  Object.keys(partial).some((key) =>
    VOICE_RESTART_KEYS.includes(key as keyof CompanionSettings),
  );

const shouldRestartVisionSession = (partial: Partial<CompanionSettings>) =>
  Object.keys(partial).some((key) =>
    VISION_RESTART_KEYS.includes(key as keyof CompanionSettings),
  );

const applyVisionLookTarget = () => {
  const face = visionStore.lastFaceState;
  if (
    !face?.detected ||
    !companionConfigStore.settings.cameraEnabled ||
    !companionConfigStore.settings.gazeTrackingEnabled
  ) {
    return;
  }

  runtime.stage.lookAt({
    x: Math.max(-0.8, Math.min(0.8, (face.gazeX ?? 0) * 0.8)),
    y: Math.max(-0.8, Math.min(0.8, (face.gazeY ?? 0) * 0.8)),
  });
};

const getVoiceEmotionMood = () => {
  if (
    !companionConfigStore.settings.voiceEmotionEnabled ||
    !voiceStore.isVoiceEmotionAvailable ||
    !voiceStore.lastVoiceEmotion ||
    voiceStore.lastVoiceEmotion.confidence < 0.45
  ) {
    return null;
  }

  if (voiceStore.lastVoiceEmotion.emotion === 'happy') {
    return 'happy';
  }

  if (voiceStore.lastVoiceEmotion.emotion === 'excited') {
    return 'excited';
  }

  if (voiceStore.lastVoiceEmotion.emotion === 'angry') {
    return 'focused';
  }

  if (voiceStore.lastVoiceEmotion.emotion === 'sad') {
    return 'sleepy';
  }

  return null;
};

const getVisionMood = () => {
  const expression = visionStore.lastFaceState?.expression;
  if (expression === 'happy') {
    return 'happy';
  }

  if (expression === 'surprised') {
    return 'excited';
  }

  if (expression === 'focused') {
    return 'focused';
  }

  if (expression === 'tired') {
    return 'sleepy';
  }

  return 'idle';
};

const syncCompanionMood = async () => {
  if (!companionConfigStore.settings.empathySyncEnabled) {
    await runtime.stage.setMood('idle');
    return;
  }

  await runtime.stage.setMood(getVoiceEmotionMood() ?? getVisionMood());
};

const refreshProactiveSettings = async (nextSettings: CompanionSettings) => {
  void nextSettings;
};

const refreshVisionSettings = async (
  nextSettings: CompanionSettings,
  partial?: Partial<CompanionSettings>,
) => {
  visionStore.reloadSettings();

  if (!nextSettings.cameraEnabled) {
    if (visionStore.isActive || visionStore.status === 'connecting') {
      await visionStore.stop();
    }
    return;
  }

  if (visionStore.isActive && partial && shouldRestartVisionSession(partial)) {
    await visionStore.stop();
    await visionStore.start();
    return;
  }
};

const refreshCompanionSettings = async (
  partial?: Partial<CompanionSettings>,
) => {
  const nextSettings = partial
    ? companionConfigStore.applySettings(partial)
    : companionConfigStore.load();

  voiceStore.reloadSettings();

  if (!nextSettings.videoCallEnabled && callWindow) {
    callWindow.close?.();
    callWindow = null;
  }

  if (!nextSettings.voiceEnabled) {
    if (voiceStore.isActive || voiceStore.status === 'connecting') {
      await voiceStore.stop();
    }
  } else if (voiceStore.isActive && partial && shouldRestartVoiceSession(partial)) {
    await voiceStore.stop();
    await voiceStore.start();
  } else if (nextSettings.autoStartMicrophone && !voiceStore.isActive) {
    await voiceStore.start();
  }

  await refreshVisionSettings(nextSettings, partial);
  await refreshProactiveSettings(nextSettings);
};

const toggleChatPanel = async () => {
  try {
    if (chatWindow) {
      chatWindow.setFocus?.();
      return;
    }

    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    chatWindow = new WebviewWindow('chat', {
      url: '/chat.html',
      title: rt('windowChatTitle'),
      width: 420,
      height: 640,
      resizable: true,
    });

    chatWindow.once('tauri://error', () => {
      chatWindow = null;
    });

    chatWindow.once('tauri://destroyed', () => {
      chatWindow = null;
    });
  } catch (error) {
    console.error('Failed to open chat window:', error);
    chatWindow = null;
  }
};

const toggleCallPanel = async () => {
  if (!companionConfigStore.settings.videoCallEnabled) {
    messageState.show(rt('petEnableVideoCallFirst'));
    await openSettingsWindow();
    return;
  }

  try {
    if (callWindow) {
      callWindow.setFocus?.();
      return;
    }

    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    callWindow = new WebviewWindow('call', {
      url: '/call.html',
      title: rt('windowCallTitle'),
      width: 1100,
      height: 760,
      resizable: true,
    });

    callWindow.once('tauri://error', () => {
      callWindow = null;
    });

    callWindow.once('tauri://destroyed', () => {
      callWindow = null;
    });
  } catch (error) {
    console.error('Failed to open call window:', error);
    callWindow = null;
  }
};

const toggleVoiceSession = async () => {
  if (!companionConfigStore.settings.voiceEnabled && !voiceStore.isActive) {
    messageState.show(rt('petEnableVoiceFirst'));
    await openSettingsWindow();
    return;
  }

  await voiceStore.toggle();

  if (voiceStore.isActive) {
    messageState.show(rt('petVoiceStarted'));
  } else if (!voiceStore.errorMessage) {
    messageState.show(rt('petVoiceStopped'));
  }
};

const toggleVisionSession = async () => {
  if (!companionConfigStore.settings.cameraEnabled && !visionStore.isActive) {
    messageState.show(rt('petEnableCameraFirst'));
    await openSettingsWindow();
    return;
  }

  await visionStore.toggle();

  if (visionStore.isActive) {
    messageState.show(rt('petCameraStarted'));
  } else if (!visionStore.errorMessage) {
    messageState.show(rt('petCameraStopped'));
  }
};

const openSettingsWindow = async () => {
  try {
    if (settingsWindow) {
      settingsWindow.focus?.();
      return;
    }

    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    settingsWindow = new WebviewWindow('settings', {
      url: '/settings.html',
      title: rt('windowSettingsTitle'),
      width: 640,
      height: 900,
    });

    settingsWindow.once('tauri://error', () => {
      settingsWindow = null;
    });

    settingsWindow.once('tauri://destroyed', () => {
      settingsWindow = null;
    });
  } catch (error) {
    console.error('Failed to open settings window:', error);
    settingsWindow = null;
  }
};

const handleMouseMove = (event: MouseEvent) => {
  if (!model || !canvasRef.value?.canvas) {
    return;
  }

  const rect = canvasRef.value.canvas.getBoundingClientRect();
  const { x, y } = getNormalizedCoords(event.clientX, event.clientY, rect);

  try {
    const live2dModel = model.model || model.internalModel || model._model;

    if (
      live2dModel &&
      !(
        companionConfigStore.settings.cameraEnabled &&
        companionConfigStore.settings.gazeTrackingEnabled &&
        visionStore.lastFaceState?.detected
      )
    ) {
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;

      const eyeX = ((event.clientX - screenCenterX) / screenCenterX) * 0.8;
      const eyeY = -((event.clientY - screenCenterY) / screenCenterY) * 0.8;
      runtime.stage.lookAt({ x: eyeX, y: eyeY });
    }
  } catch (error) {
    console.error('Failed to update gaze tracking:', error);
  }

  const headHit = isInHitArea(x, y, currentModel.value.hitAreas.head);
  const bodyHit = isInHitArea(x, y, currentModel.value.hitAreas.body);
  const isOverPet = headHit || bodyHit;

  if (isOverPet) {
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    canvasRef.value.canvas.style.cursor = 'pointer';

    if (Math.random() < 0.02) {
      if (headHit) {
        messageState.showRandom(messageState.messages.mouseover?.head);
      } else if (bodyHit) {
        messageState.showRandom(messageState.messages.mouseover?.body);
      }
    }
  } else {
    canvasRef.value.canvas.style.cursor = 'default';
  }

  if (settingsStore.settings.idleDetection) {
    resetIdleTimer();
  }
};

const handleClick = (event: MouseEvent) => {
  if (!model || isSleeping.value || !canvasRef.value?.canvas) {
    return;
  }

  const rect = canvasRef.value.canvas.getBoundingClientRect();
  const { x, y } = getNormalizedCoords(event.clientX, event.clientY, rect);

  if (isInHitArea(x, y, currentModel.value.hitAreas.head)) {
    canvasRef.value.playMotion('flick_head');
    canvasRef.value.playMotion('happy');
    messageState.showRandom(messageState.messages.click?.head);
  } else if (isInHitArea(x, y, currentModel.value.hitAreas.body)) {
    canvasRef.value.playMotion('tap_body');
    messageState.showRandom(messageState.messages.click?.body);
  }

  if (settingsStore.settings.idleDetection) {
    resetIdleTimer();
  }
};

const updateCanvasSize = () => {
  if (!containerRef.value) {
    return;
  }

  const containerWidth = containerRef.value.offsetWidth;
  const containerHeight = containerRef.value.offsetHeight;

  canvasWidth.value = Math.max(MIN_WIDTH, containerWidth);
  canvasHeight.value = Math.max(MIN_HEIGHT, containerHeight);
};

watch(
  () => voiceStore.status,
  (nextStatus, previousStatus) => {
    if (nextStatus === previousStatus) {
      return;
    }

    if (nextStatus === 'connecting') {
      messageState.show(rt('petConnectingVoice'));
      return;
    }

    if (
      nextStatus === 'listening' &&
      ['idle', 'connecting', 'error'].includes(previousStatus ?? '')
    ) {
      messageState.show(rt('petVoiceReady'));
      return;
    }

    if (nextStatus === 'processing') {
      messageState.show(rt('petListeningEllipsis'));
      return;
    }

    if (nextStatus === 'speaking' && previousStatus === 'processing') {
      messageState.show(rt('petReplyingEllipsis'));
    }
  },
);

watch(
  () => voiceStore.errorMessage,
  (nextMessage, previousMessage) => {
    if (nextMessage && nextMessage !== previousMessage) {
      messageState.show(localizeRuntimeText(currentLocale.value, nextMessage));
    }
  },
);

watch(
  () =>
    (Array.isArray(voiceStore.providerIssues) ? voiceStore.providerIssues : []).join(
      '|',
    ),
  (nextIssues, previousIssues) => {
    if (!nextIssues || nextIssues === previousIssues) {
      return;
    }

    messageState.show(
      localizeRuntimeText(
        currentLocale.value,
        (Array.isArray(voiceStore.providerIssues) ? voiceStore.providerIssues : [])[0],
      ),
    );
  },
);

watch(
  () => voiceStore.lastWakeWordEvent,
  (nextEvent, previousEvent) => {
    if (nextEvent && nextEvent !== previousEvent) {
      messageState.show(rt('petWakeWordDetected', { value: nextEvent }));
    }
  },
);

watch(
  () => voiceStore.lastVadState?.active,
  (nextActive, previousActive) => {
    if (nextActive === previousActive || nextActive == null) {
      return;
    }

    if (nextActive) {
      messageState.show(rt('petIAmListening'));
      return;
    }

    if (previousActive) {
      messageState.show(rt('petProcessingWhatYouSaid'));
    }
  },
);

watch(
  () => voiceStore.lastVoiceEmotion?.updatedAt ?? 0,
  () => {
    const emotionState = voiceStore.lastVoiceEmotion;
    if (!emotionState || emotionState.emotion === 'unknown') {
      return;
    }

    void syncCompanionMood();

    if (emotionState.confidence < 0.45) {
      return;
    }

    if (emotionState.emotion === 'happy') {
      messageState.show(rt('petYouSoundHappy'));
      return;
    }

    if (emotionState.emotion === 'excited') {
      messageState.show(rt('petYouSoundExcited'));
      return;
    }

    if (emotionState.emotion === 'sad') {
      messageState.show(rt('petYouSoundSad'));
      return;
    }

    if (emotionState.emotion === 'angry') {
      messageState.show(rt('petYouSoundAngry'));
      return;
    }

    if (emotionState.emotion === 'calm') {
      messageState.show(rt('petYouSoundCalm'));
    }
  },
);

watch(
  () => visionStore.status,
  (nextStatus, previousStatus) => {
    if (nextStatus === previousStatus) {
      return;
    }

    if (nextStatus === 'connecting') {
      messageState.show(rt('petConnectingCamera'));
      return;
    }

    if (
      nextStatus === 'watching' &&
      ['idle', 'connecting', 'error'].includes(previousStatus ?? '')
    ) {
      const backendHint = visionStore.backendLabel
        ? ` (${visionStore.backendLabel})`
        : '';
      messageState.show(rt('petCameraReady', { backend: backendHint }));
    }
  },
);

watch(
  () => visionStore.errorMessage,
  (nextMessage, previousMessage) => {
    if (nextMessage && nextMessage !== previousMessage) {
      messageState.show(localizeRuntimeText(currentLocale.value, nextMessage));
    }
  },
);

watch(
  () => (visionStore.lastFaceState?.detected ? 'detected' : 'missing'),
  (nextState, previousState) => {
    if (nextState === previousState) {
      return;
    }

    if (nextState === 'detected') {
      messageState.show(rt('petFaceDetected'));
      return;
    }

    if (previousState === 'detected') {
      messageState.show(rt('petFaceLost'));
    }
  },
);

watch(
  () => visionStore.lastFaceState,
  () => {
    applyVisionLookTarget();
    void syncCompanionMood();
  },
  { deep: true },
);

watch(
  () => visionStore.lastFaceState?.expression ?? 'neutral',
  (nextExpression, previousExpression) => {
    if (
      !visionStore.lastFaceState?.detected ||
      nextExpression === previousExpression
    ) {
      return;
    }

    if (nextExpression === 'happy') {
      messageState.show(rt('petExpressionHappy'));
      return;
    }

    if (nextExpression === 'surprised') {
      messageState.show(rt('petExpressionSurprised'));
      return;
    }

    if (nextExpression === 'focused') {
      messageState.show(rt('petExpressionFocused'));
      return;
    }

    if (nextExpression === 'tired') {
      messageState.show(rt('petExpressionTired'));
    }
  },
);

watch(
  () => gestureSignature.value,
  (nextGestures, previousGestures) => {
    if (!nextGestures || nextGestures === previousGestures) {
      return;
    }

    if (nextGestures.includes('wave')) {
      messageState.show(rt('petGestureWave'));
      return;
    }

    if (nextGestures.includes('thumbs_up')) {
      messageState.show(rt('petGestureThumbsUp'));
      return;
    }

    if (nextGestures.includes('peace')) {
      messageState.show(rt('petGesturePeace'));
      return;
    }

    if (nextGestures.includes('ok')) {
      messageState.show(rt('petGestureOk'));
      return;
    }

    if (nextGestures.includes('open_palm')) {
      messageState.show(rt('petGestureOpenPalm'));
      return;
    }

    if (nextGestures.includes('point')) {
      messageState.show(rt('petGesturePoint'));
    }
  },
);

watch(
  currentLocale,
  (locale) => {
    messageState.setMessages(RUNTIME_CHARACTER_MESSAGES[locale]);
  },
);

watch(
  () => companionConfigStore.settings.empathySyncEnabled,
  (enabled) => {
    if (!enabled) {
      void runtime.stage.setMood('idle');
      return;
    }

    void syncCompanionMood();
  },
);

watch(
  () => companionConfigStore.settings.voiceEmotionEnabled,
  () => {
    void syncCompanionMood();
  },
);

onMounted(async () => {
  await refreshSettings();
  voiceStore.registerCommandHandlers({
    openChat: async () => {
      if (!settingsStore.settings.enableChat) {
        messageState.show(rt('petChatWindowDisabled'));
        return;
      }

      await toggleChatPanel();
      messageState.show(rt('petChatWindowOpened'));
    },
    openSettings: async () => {
      await openSettingsWindow();
      messageState.show(rt('petSettingsOpened'));
    },
  });
  await refreshCompanionSettings();
  await syncCompanionMood();
  await setupTauriWindow();
  updateCanvasSize();

  resizeObserver = new ResizeObserver(() => {
    updateCanvasSize();
  });

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('click', handleClick);

  unlistenSettings = await listenRuntimeEvent('settings-changed', (payload) => {
    void refreshSettings((payload ?? {}) as Partial<DesktopPetSettings>);
  });
  unlistenCompanionSettings = await listenRuntimeEvent(
    'companion-settings-changed',
    (payload) => {
      void refreshCompanionSettings(
        (payload ?? {}) as Partial<CompanionSettings>,
      );
    },
  );
  unlistenMotionPreview = await listenRuntimeEvent(
    'stage-preview-motion',
    (payload) => {
      void runtime.stage.playMotion(payload);
    },
  );
  unlistenExpressionPreview = await listenRuntimeEvent(
    'stage-preview-expression',
    (payload) => {
      void runtime.stage.setExpression(payload);
    },
  );
  unlistenProactiveReminder = await listenRuntimeEvent(
    'proactive-reminder',
    (payload) => {
      if (payload?.message) {
        messageState.show(payload.message);
      }
    },
  );
  unlistenDesktopInsight = await listenRuntimeEvent('desktop-insight', (payload) => {
    if (payload?.message) {
      messageState.show(payload.message);
    }
  });
  unlistenDesktopWarning = await listenRuntimeEvent('desktop-warning', (payload) => {
    if (payload?.message) {
      messageState.show(payload.message);
    }
  });
  unlistenRelationshipState = await listenRuntimeEvent('relationship-state', (payload) => {
    const signature = `${payload.level}:${payload.mood}:${payload.affection}`;
    if (signature === lastRelationshipSignature) {
      return;
    }

    lastRelationshipSignature = signature;
    void runtime.stage.setMood(payload.mood as any);
    messageState.show(formatRelationshipMessage(payload));
  });
  unlistenVoiceShortcut = await listenRuntimeEvent('shortcut-voice-record', (payload) => {
    if (payload?.phase === 'pressed') {
      if (!voiceStore.isActive && companionConfigStore.settings.voiceEnabled) {
        voiceShortcutOwnsSession = true;
        void voiceStore.start();
      }
      return;
    }

    if (voiceShortcutOwnsSession && voiceStore.isActive) {
      voiceShortcutOwnsSession = false;
      void voiceStore.stop();
      return;
    }

    voiceShortcutOwnsSession = false;
  });
  unlistenScreenshotShortcut = await listenRuntimeEvent(
    'shortcut-screenshot-translate',
    () => {
      if (screenshotTranslationStore.status !== 'idle') {
        const busyMessage =
          currentLocale.value === 'zh-CN'
            ? '截图翻译正在处理中，请稍等。'
            : 'Screenshot translation is already running.';
        messageState.show(busyMessage);
        return;
      }

      const startMessage =
        currentLocale.value === 'zh-CN'
          ? '正在截图、识别并翻译文字...'
          : 'Capturing screen, extracting text, and translating...';
      messageState.show(startMessage);

      void screenshotTranslationStore
        .captureAndTranslate({ hideMainWindow: true, selectionMode: 'region' })
        .then((payload) => {
          if (payload.error) {
            messageState.show(payload.error);
            return;
          }

          const readyMessage =
            currentLocale.value === 'zh-CN'
              ? '截图翻译已生成，结果已显示在悬浮窗。'
              : 'Screenshot translation is ready in the overlay window.';
          messageState.show(readyMessage);
        })
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : currentLocale.value === 'zh-CN'
                ? '截图翻译失败。'
                : 'Screenshot translation failed.';
          messageState.show(message);
        });
    },
  );
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('click', handleClick);

  resizeObserver?.disconnect();
  resizeObserver = null;

  if (unlistenWindowResize) {
    unlistenWindowResize();
  }

  if (unlistenSettings) {
    unlistenSettings();
  }

  if (unlistenCompanionSettings) {
    unlistenCompanionSettings();
  }

  if (unlistenMotionPreview) {
    unlistenMotionPreview();
  }

  if (unlistenExpressionPreview) {
    unlistenExpressionPreview();
  }

  if (unlistenProactiveReminder) {
    unlistenProactiveReminder();
  }

  if (unlistenDesktopInsight) {
    unlistenDesktopInsight();
  }

  if (unlistenDesktopWarning) {
    unlistenDesktopWarning();
  }

  if (unlistenRelationshipState) {
    unlistenRelationshipState();
  }

  if (unlistenVoiceShortcut) {
    unlistenVoiceShortcut();
  }

  if (unlistenScreenshotShortcut) {
    unlistenScreenshotShortcut();
  }

  if (hideTimer) {
    clearTimeout(hideTimer);
  }

  void visionStore.stop();
  void voiceStore.stop();
  runtime.stage.detachCanvas();
});
</script>

<style scoped>
.pet-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: visible;
  background-color: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  pointer-events: none;
}

:deep(.control-btn) {
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.control-btn:hover) {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 1);
}

:deep(.control-btn:active) {
  transform: scale(0.95);
}

:deep(.control-btn.is-active) {
  background: linear-gradient(135deg, #2a72ff 0%, #0ec5d7 100%);
  color: white;
}
</style>
