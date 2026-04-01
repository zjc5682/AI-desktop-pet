<template>
  <main class="call-shell">
    <video
      v-if="showBlurBackdrop"
      ref="backgroundVideoRef"
      class="call-backdrop-video"
      muted
      playsinline
    />
    <div
      v-if="showImageBackdrop"
      class="call-backdrop-image"
      :style="backgroundImageStyle"
    ></div>
    <div class="call-backdrop-overlay"></div>

    <header class="call-topbar">
      <div class="call-heading">
        <p class="call-kicker">{{ rt('callKicker') }}</p>
        <h1>{{ rt('callTitle') }}</h1>
        <p class="call-copy">
          {{ rt('callCopy') }}
        </p>
      </div>

      <div class="call-actions">
        <button
          :class="['call-btn', { active: visionStore.isActive }]"
          @click="toggleVisionSession"
        >
          {{ visionStore.isActive ? rt('callCameraOnButton') : rt('callCameraButton') }}
        </button>
        <button
          :class="['call-btn', { active: voiceStore.isActive }]"
          @click="toggleVoiceSession"
        >
          {{ voiceStore.isActive ? rt('callMicOnButton') : rt('callMicButton') }}
        </button>
        <button class="call-btn" @click="openSettingsWindow">{{ rt('callSettingsButton') }}</button>
        <button class="call-btn call-btn-danger" @click="closeWindow">{{ rt('callEndButton') }}</button>
      </div>
    </header>

    <section class="status-strip">
      <div class="status-pill">
        <span class="status-label">{{ rt('callStatusCamera') }}</span>
        <strong>{{ localizedVisionStatus }}</strong>
      </div>
      <div class="status-pill">
        <span class="status-label">{{ rt('callStatusVoice') }}</span>
        <strong>{{ localizedVoiceStatus }}</strong>
      </div>
      <div class="status-pill">
        <span class="status-label">{{ rt('callStatusVAD') }}</span>
        <strong>{{ vadLabel }}</strong>
      </div>
      <div class="status-pill">
        <span class="status-label">{{ rt('callStatusVoiceEmotion') }}</span>
        <strong>{{ voiceEmotionLabel }}</strong>
      </div>
      <div class="status-pill">
        <span class="status-label">{{ rt('callStatusExpression') }}</span>
        <strong>{{ expressionLabel }}</strong>
      </div>
      <div class="status-pill">
        <span class="status-label">{{ rt('callStatusGesture') }}</span>
        <strong>{{ primaryGestureLabel }}</strong>
      </div>
      <div class="status-pill">
        <span class="status-label">{{ rt('callStatusEyeContact') }}</span>
        <strong>{{ eyeContactLabel }}</strong>
      </div>
    </section>

    <section class="call-grid">
      <article class="camera-card">
        <div class="panel-head">
          <div>
            <h2>{{ rt('callUserCameraTitle') }}</h2>
            <p>{{ rt('callUserCameraCopy') }}</p>
          </div>
          <span class="panel-badge">{{ cameraBadge }}</span>
        </div>

        <div class="camera-stage">
          <video
            v-if="visionStore.previewStream"
            ref="cameraVideoRef"
            class="camera-video"
            muted
            playsinline
          />
          <div v-else class="camera-empty">
            <strong>{{ rt('callCameraOfflineTitle') }}</strong>
            <p>{{ rt('callCameraOfflineCopy') }}</p>
          </div>

          <div class="camera-overlay">
            <span v-if="visionStore.lastFaceState?.detected" class="overlay-chip">
              {{ rt('callFaceLocked') }}
            </span>
            <span v-if="visionStore.lastFaceState?.eyeContact" class="overlay-chip">
              {{ rt('callEyeContact') }}
            </span>
            <span v-if="visionStore.backendLabel" class="overlay-chip">
              {{ visionStore.backendLabel }}
            </span>
          </div>
        </div>

        <div class="camera-meta">
          <div class="meta-card">
            <span class="meta-label">{{ rt('callGazeVector') }}</span>
            <strong>{{ gazeLabel }}</strong>
          </div>
          <div class="meta-card">
            <span class="meta-label">{{ rt('callBackend') }}</span>
            <strong>{{ localizedBackendLabel }}</strong>
          </div>
          <div class="meta-card">
            <span class="meta-label">{{ rt('callPreviewMode') }}</span>
            <strong>{{ backgroundModeLabel }}</strong>
          </div>
        </div>
      </article>

      <article class="avatar-card">
        <div class="panel-head">
          <div>
            <h2>{{ rt('callCompanionStageTitle') }}</h2>
            <p>{{ rt('callCompanionStageCopy') }}</p>
          </div>
          <span class="panel-badge">{{ assistantMoodLabel }}</span>
        </div>

        <div ref="stageFrameRef" class="avatar-stage">
          <div class="avatar-glow" :data-expression="rawExpression"></div>
          <Live2DCanvas
            ref="canvasRef"
            :model-path="modelPath"
            :width="canvasWidth"
            :height="canvasHeight"
            :is-sleeping="false"
            @model-loaded="handleModelLoaded"
          />
        </div>

        <div class="assistant-card">
          <p class="assistant-kicker">{{ rt('callRealtimeResponse') }}</p>
          <h3>{{ assistantHeadline }}</h3>
          <p class="assistant-copy">{{ assistantMessage }}</p>
          <div class="assistant-signals">
            <span class="overlay-chip">STT {{ voiceStore.activeSttProvider || rt('genericPending') }}</span>
            <span class="overlay-chip">TTS {{ voiceStore.activeTtsProvider || rt('genericPending') }}</span>
            <span class="overlay-chip">{{ rt('callEmotionSignal') }} {{ voiceEmotionProviderLabel }}</span>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { CompanionSettings, DesktopPetSettings, UiLanguage } from '@table-pet/shared';
import { getDesktopCompanionRuntime } from './companion/runtime';
import Live2DCanvas from './components/Live2DPetComponents/Live2DCanvas.vue';
import {
  localizeRuntimeText,
  localizeRuntimeValue,
  normalizeUiLanguage,
  runtimeText,
} from './i18n/runtimeLocale';
import { useCompanionConfigStore } from './stores/companionConfig';
import { useCompanionSettingsStore } from './stores/companionSettings';
import { useLive2DStore } from './stores/live2d';
import { useVisionStore } from './stores/vision';
import { useVoiceStore } from './stores/voice';
import { listenRuntimeEvent } from './utils/runtimeEvents';

const companionConfigStore = useCompanionConfigStore();
const settingsStore = useCompanionSettingsStore();
const live2dStore = useLive2DStore();
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

const canvasRef = ref<InstanceType<typeof Live2DCanvas> | null>(null);
const stageFrameRef = ref<HTMLElement | null>(null);
const cameraVideoRef = ref<HTMLVideoElement | null>(null);
const backgroundVideoRef = ref<HTMLVideoElement | null>(null);
const canvasWidth = ref(520);
const canvasHeight = ref(640);

let resizeObserver: ResizeObserver | null = null;
let settingsWindow: any = null;
let unlistenCompanionSettings: (() => void) | null = null;
let unlistenDesktopSettings: (() => void) | null = null;

const modelPath = computed(
  () => live2dStore.activeModelPath || '/models/histoire/model.json',
);
const showBlurBackdrop = computed(
  () =>
    companionConfigStore.settings.virtualBackgroundMode === 'blur' &&
    Boolean(visionStore.previewStream),
);
const showImageBackdrop = computed(
  () =>
    companionConfigStore.settings.virtualBackgroundMode === 'image' &&
    Boolean(companionConfigStore.settings.virtualBackgroundImage),
);
const backgroundImageStyle = computed(() => ({
  backgroundImage: `url("${companionConfigStore.settings.virtualBackgroundImage}")`,
}));
const rawExpression = computed(
  () => visionStore.lastFaceState?.expression ?? 'neutral',
);
const expressionLabel = computed(() =>
  localizeRuntimeValue(currentLocale.value, rawExpression.value),
);
const rawPrimaryGesture = computed(
  () => visionStore.lastGestures[0]?.name ?? 'none',
);
const primaryGestureLabel = computed(() =>
  localizeRuntimeValue(currentLocale.value, rawPrimaryGesture.value),
);
const eyeContactLabel = computed(() => {
  if (!visionStore.lastFaceState?.detected) {
    return rt('genericNA');
  }

  return visionStore.lastFaceState.eyeContact
    ? rt('genericEngaged')
    : rt('genericLoose');
});
const cameraBadge = computed(() => {
  if (visionStore.errorMessage) {
    return rt('genericAttention');
  }

  if (visionStore.isActive) {
    return rt('genericLive');
  }

  return rt('genericStandby');
});
const backgroundModeLabel = computed(() => {
  const mode = companionConfigStore.settings.virtualBackgroundMode;
  if (mode === 'image') {
    return rt('genericImage');
  }
  if (mode === 'blur') {
    return rt('genericBlur');
  }
  return rt('genericNone');
});
const localizedBackendLabel = computed(
  () => visionStore.backendLabel || rt('genericPending'),
);
const gazeLabel = computed(() => {
  if (!visionStore.lastFaceState?.detected) {
    return rt('genericWaiting');
  }

  return `${(visionStore.lastFaceState.gazeX ?? 0).toFixed(2)}, ${(visionStore.lastFaceState.gazeY ?? 0).toFixed(2)}`;
});
const vadLabel = computed(() => {
  if (!voiceStore.isActive) {
    return rt('genericOff');
  }

  if (!voiceStore.lastVadState) {
    return rt('genericIdle');
  }

  return voiceStore.lastVadState.active ? rt('genericSpeech') : rt('genericSilence');
});
const voiceEmotionLabel = computed(() => {
  if (!companionConfigStore.settings.voiceEmotionEnabled) {
    return rt('genericOff');
  }

  if (!voiceStore.isVoiceEmotionAvailable) {
    return rt('genericUnavailable');
  }

  return localizeRuntimeValue(
    currentLocale.value,
    voiceStore.lastVoiceEmotion?.emotion ?? 'waiting',
  );
});
const voiceEmotionProviderLabel = computed(() => {
  if (!companionConfigStore.settings.voiceEmotionEnabled) {
    return rt('genericOff');
  }

  if (!voiceStore.isVoiceEmotionAvailable) {
    return rt('genericUnavailable');
  }

  return voiceStore.activeVoiceEmotionProvider || rt('genericPending');
});
const resolveVoiceEmotionMood = () => {
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
const resolveVisionMood = () => {
  const expression = rawExpression.value;

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
const assistantMoodLabel = computed(() => {
  if (!companionConfigStore.settings.empathySyncEnabled) {
    return rt('genericManual');
  }

  return localizeRuntimeValue(
    currentLocale.value,
    resolveVoiceEmotionMood() ?? resolveVisionMood(),
  );
});
const assistantHeadline = computed(() => {
  if (voiceStore.lastVadState?.active) {
    return rt('callAssistantListening');
  }
  if (voiceStore.status === 'speaking') {
    return rt('callAssistantReplying');
  }
  if (voiceStore.status === 'processing') {
    return rt('callAssistantThinking');
  }
  if (voiceStore.lastVoiceEmotion?.emotion === 'sad') {
    return rt('callAssistantSupport');
  }
  if (voiceStore.lastVoiceEmotion?.emotion === 'angry') {
    return rt('callAssistantSteady');
  }
  if (
    voiceStore.lastVoiceEmotion?.emotion === 'happy' ||
    voiceStore.lastVoiceEmotion?.emotion === 'excited'
  ) {
    return rt('callAssistantEnergy');
  }
  if (visionStore.lastFaceState?.eyeContact) {
    return rt('callAssistantPresent');
  }
  return rt('callAssistantReady');
});
const assistantMessage = computed(() => {
  const providerIssues = Array.isArray(voiceStore.providerIssues)
    ? voiceStore.providerIssues
    : [];

  if (voiceStore.errorMessage) {
    return localizeRuntimeText(currentLocale.value, voiceStore.errorMessage);
  }
  if (visionStore.errorMessage) {
    return localizeRuntimeText(currentLocale.value, visionStore.errorMessage);
  }
  if (providerIssues.length) {
    return localizeRuntimeText(currentLocale.value, providerIssues[0]);
  }
  if (voiceStore.lastVadState?.active) {
    return rt('callAssistantLiveSpeech');
  }
  if (voiceStore.lastAssistantText) {
    return voiceStore.lastAssistantText;
  }
  if (voiceStore.lastVoiceEmotion?.emotion === 'sad') {
    return rt('callAssistantSad');
  }
  if (voiceStore.lastVoiceEmotion?.emotion === 'angry') {
    return rt('callAssistantAngry');
  }
  if (voiceStore.lastVoiceEmotion?.emotion === 'happy') {
    return rt('callAssistantHappy');
  }
  if (voiceStore.lastVoiceEmotion?.emotion === 'excited') {
    return rt('callAssistantExcited');
  }
  if (voiceStore.lastTranscript) {
    return rt('callAssistantHeard', { value: voiceStore.lastTranscript });
  }
  if (visionStore.lastFaceState?.detected) {
    return rt('callAssistantVisionLocked');
  }
  return rt('callAssistantStart');
});

const localizedVisionStatus = computed(() =>
  localizeRuntimeValue(currentLocale.value, visionStore.status),
);
const localizedVoiceStatus = computed(() =>
  localizeRuntimeValue(currentLocale.value, voiceStore.status),
);

function updateStageSize() {
  if (!stageFrameRef.value) {
    return;
  }

  canvasWidth.value = Math.max(360, stageFrameRef.value.clientWidth);
  canvasHeight.value = Math.max(420, stageFrameRef.value.clientHeight);
}

async function bindStreamToElement(video: HTMLVideoElement | null) {
  if (!video) {
    return;
  }

  if (video.srcObject !== visionStore.previewStream) {
    video.srcObject = visionStore.previewStream;
  }

  if (visionStore.previewStream) {
    try {
      await video.play();
    } catch {
      return;
    }
  }
}

async function bindPreviewStreams() {
  await bindStreamToElement(cameraVideoRef.value);
  await bindStreamToElement(backgroundVideoRef.value);
}

function handleModelLoaded() {
  if (!canvasRef.value) {
    return;
  }

  runtime.stage.attachCanvas(canvasRef.value);
}

function applyVisionLookTarget() {
  if (
    !visionStore.lastFaceState?.detected ||
    !companionConfigStore.settings.gazeTrackingEnabled
  ) {
    runtime.stage.lookAt({ x: 0, y: 0 });
    return;
  }

  runtime.stage.lookAt({
    x: Math.max(-0.95, Math.min(0.95, (visionStore.lastFaceState.gazeX ?? 0) * 0.95)),
    y: Math.max(-0.95, Math.min(0.95, (visionStore.lastFaceState.gazeY ?? 0) * 0.95)),
  });
}

async function syncCompanionMood() {
  if (!companionConfigStore.settings.empathySyncEnabled) {
    await runtime.stage.setMood('idle');
    return;
  }

  await runtime.stage.setMood(resolveVoiceEmotionMood() ?? resolveVisionMood());
}

async function refreshDesktopSettings(partial?: Partial<DesktopPetSettings>) {
  if (partial) {
    settingsStore.applySettings(partial);
  } else {
    settingsStore.load();
  }

  await live2dStore.loadModels();
  await live2dStore.applySelection({
    useDefaultModel: settingsStore.settings.useDefaultModel,
    selectedModel: settingsStore.settings.selectedModel,
  });

  await runtime.stage.setModel({
    name: live2dStore.currentModel ?? 'histoire',
    path: live2dStore.activeModelPath,
  });
}

async function refreshCompanionSettings(partial?: Partial<CompanionSettings>) {
  const nextSettings = partial
    ? companionConfigStore.applySettings(partial)
    : companionConfigStore.load();

  visionStore.reloadSettings();
  voiceStore.reloadSettings();

  if (nextSettings.cameraEnabled) {
    if (!visionStore.isActive && visionStore.status !== 'connecting') {
      await visionStore.start();
    }
  } else if (visionStore.isActive || visionStore.status === 'connecting') {
    await visionStore.stop();
  }

  if (nextSettings.voiceEnabled && nextSettings.autoStartMicrophone) {
    if (!voiceStore.isActive) {
      await voiceStore.start();
    }
  } else if (!nextSettings.voiceEnabled && voiceStore.isActive) {
    await voiceStore.stop();
  }
}

async function toggleVisionSession() {
  if (!companionConfigStore.settings.cameraEnabled && !visionStore.isActive) {
    await openSettingsWindow();
    return;
  }

  await visionStore.toggle();
}

async function toggleVoiceSession() {
  if (!companionConfigStore.settings.voiceEnabled && !voiceStore.isActive) {
    await openSettingsWindow();
    return;
  }

  await voiceStore.toggle();
}

async function openSettingsWindow() {
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
}

async function closeWindow() {
  await getCurrentWindow().close();
}

watch(
  () => visionStore.previewStream,
  () => {
    void bindPreviewStreams();
  },
);

watch(
  () => [cameraVideoRef.value, backgroundVideoRef.value],
  () => {
    void bindPreviewStreams();
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
  () => companionConfigStore.settings.empathySyncEnabled,
  () => {
    void syncCompanionMood();
  },
);

watch(
  () => voiceStore.lastVoiceEmotion?.updatedAt ?? 0,
  () => {
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
  await refreshDesktopSettings();
  await refreshCompanionSettings();
  await runtime.stage.switchMode('call');
  await syncCompanionMood();
  document.title = rt('windowCallTitle');

  resizeObserver = new ResizeObserver(() => {
    updateStageSize();
  });

  if (stageFrameRef.value) {
    resizeObserver.observe(stageFrameRef.value);
  }
  updateStageSize();
  await bindPreviewStreams();

  unlistenDesktopSettings = await listenRuntimeEvent('settings-changed', (payload) => {
    void refreshDesktopSettings((payload ?? {}) as Partial<DesktopPetSettings>);
  });
  unlistenCompanionSettings = await listenRuntimeEvent(
    'companion-settings-changed',
    (payload) => {
      void refreshCompanionSettings((payload ?? {}) as Partial<CompanionSettings>);
    },
  );
});

watch(currentLocale, () => {
  document.title = rt('windowCallTitle');
});

onUnmounted(() => {
  unlistenDesktopSettings?.();
  unlistenCompanionSettings?.();
  resizeObserver?.disconnect();
  resizeObserver = null;

  void voiceStore.stop();
  void visionStore.stop();
  runtime.stage.detachCanvas();
  void runtime.stage.switchMode('desktop');
});
</script>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  margin: 0;
  width: 100%;
  height: 100%;
}

:global(body) {
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #0b1018;
  color: #eff4ff;
}

.call-shell {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(56, 196, 255, 0.2), transparent 28%),
    radial-gradient(circle at bottom right, rgba(255, 177, 89, 0.22), transparent 34%),
    linear-gradient(145deg, #071019 0%, #10192a 48%, #1b2234 100%);
}

.call-backdrop-video,
.call-backdrop-image,
.call-backdrop-overlay {
  position: absolute;
  inset: 0;
}

.call-backdrop-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(34px) saturate(1.2);
  opacity: 0.34;
  transform: scale(1.08);
}

.call-backdrop-image {
  background-position: center;
  background-size: cover;
  opacity: 0.32;
}

.call-backdrop-overlay {
  background:
    linear-gradient(180deg, rgba(7, 16, 25, 0.2) 0%, rgba(7, 16, 25, 0.72) 100%),
    radial-gradient(circle at center, rgba(22, 40, 64, 0.2), rgba(7, 16, 25, 0.78));
}

.call-topbar,
.status-strip,
.call-grid {
  position: relative;
  z-index: 1;
}

.call-topbar {
  display: flex;
  justify-content: space-between;
  gap: 28px;
  padding: 28px 32px 18px;
}

.call-heading {
  max-width: 540px;
}

.call-kicker,
.assistant-kicker {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
  color: #81d8ff;
}

.call-heading h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1;
}

.call-copy {
  margin: 14px 0 0;
  color: rgba(239, 244, 255, 0.78);
  line-height: 1.6;
}

.call-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  align-content: flex-start;
}

.call-btn {
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  padding: 0 18px;
  min-height: 40px;
  background: rgba(255, 255, 255, 0.08);
  color: #eff4ff;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.call-btn:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.14);
}

.call-btn.active {
  border-color: rgba(129, 216, 255, 0.9);
  background: linear-gradient(135deg, rgba(55, 166, 255, 0.72), rgba(10, 205, 214, 0.82));
}

.call-btn-danger {
  border-color: rgba(255, 122, 112, 0.55);
  background: rgba(148, 42, 36, 0.28);
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 12px;
  padding: 0 32px 20px;
}

.status-pill,
.meta-card,
.assistant-card,
.camera-card,
.avatar-card {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(9, 16, 27, 0.58);
  backdrop-filter: blur(14px);
}

.status-pill {
  padding: 14px 16px;
  border-radius: 18px;
}

.status-label,
.meta-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(239, 244, 255, 0.58);
  margin-bottom: 6px;
}

.status-pill strong,
.meta-card strong,
.panel-badge {
  font-size: 15px;
}

.call-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr);
  gap: 20px;
  padding: 0 32px 32px;
}

.camera-card,
.avatar-card {
  border-radius: 28px;
  padding: 18px;
  min-height: 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.panel-head h2 {
  margin: 0;
  font-size: 22px;
}

.panel-head p {
  margin: 6px 0 0;
  color: rgba(239, 244, 255, 0.7);
}

.panel-badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.camera-stage {
  position: relative;
  min-height: 460px;
  overflow: hidden;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(16, 34, 53, 0.36), rgba(9, 16, 27, 0.9)),
    linear-gradient(135deg, rgba(66, 122, 255, 0.3), rgba(25, 208, 198, 0.16));
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scaleX(-1);
}

.camera-empty {
  min-height: 460px;
  display: grid;
  place-content: center;
  text-align: center;
  padding: 24px;
  color: rgba(239, 244, 255, 0.8);
}

.camera-empty strong {
  font-size: 18px;
  margin-bottom: 8px;
}

.camera-overlay {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.overlay-chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(9, 16, 27, 0.74);
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 12px;
}

.camera-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.meta-card {
  border-radius: 20px;
  padding: 14px 16px;
}

.avatar-stage {
  position: relative;
  min-height: 520px;
  border-radius: 28px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.1), transparent 38%),
    linear-gradient(180deg, rgba(19, 29, 43, 0.22), rgba(8, 12, 20, 0.72));
}

.avatar-glow {
  position: absolute;
  inset: 12% 16% auto 16%;
  height: 56%;
  border-radius: 999px;
  filter: blur(42px);
  opacity: 0.54;
  background: rgba(255, 255, 255, 0.12);
}

.avatar-glow[data-expression='happy'] {
  background: rgba(255, 190, 70, 0.34);
}

.avatar-glow[data-expression='focused'] {
  background: rgba(64, 150, 255, 0.34);
}

.avatar-glow[data-expression='tired'] {
  background: rgba(109, 137, 204, 0.3);
}

.avatar-glow[data-expression='surprised'] {
  background: rgba(255, 127, 93, 0.38);
}

.assistant-card {
  margin-top: 16px;
  border-radius: 24px;
  padding: 18px 20px;
}

.assistant-card h3 {
  margin: 0 0 10px;
  font-size: 24px;
}

.assistant-copy {
  margin: 0;
  color: rgba(239, 244, 255, 0.8);
  line-height: 1.7;
}

.assistant-signals {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

@media (max-width: 1100px) {
  .status-strip,
  .call-grid {
    grid-template-columns: 1fr;
  }

  .call-topbar {
    flex-direction: column;
  }

  .call-actions {
    justify-content: flex-start;
  }

  .camera-meta {
    grid-template-columns: 1fr;
  }
}
</style>
