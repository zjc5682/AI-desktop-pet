import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { loadCompanionSettings, type CompanionSettings } from '@table-pet/shared';
import type { FaceState, GestureState } from '@table-pet/perception';
import { localizeRuntimeText, normalizeUiLanguage } from '../i18n/runtimeLocale';
import { ensureBackendService } from '../utils/desktopCommands';

type VisionStatus = 'idle' | 'connecting' | 'watching' | 'error';

export interface VisionFaceState extends FaceState {
  confidence?: number;
  faceCenterX?: number;
  faceCenterY?: number;
  gazeX?: number;
  gazeY?: number;
}

type VisionSocketMessage =
  | {
      type: 'vision_session_ready';
      sessionId?: string;
      backend?: string;
      available?: boolean;
      reason?: string;
    }
  | { type: 'vision_state'; state?: VisionStatus }
  | { type: 'vision_face_state'; face?: VisionFaceState }
  | { type: 'vision_gesture_state'; gestures?: GestureState[] }
  | { type: 'vision_error'; message?: string };

const status = ref<VisionStatus>('idle');
const errorMessage = ref('');
const isActive = ref(false);
const lastFaceState = ref<VisionFaceState | null>(null);
const lastGestures = ref<GestureState[]>([]);
const backendLabel = ref('');
const previewStream = shallowRef<MediaStream | null>(null);
const lastFrameAt = ref(0);
const lastFaceDetectedAt = ref(0);

const DEFAULT_SESSION_ID = 'camera';
const DEFAULT_CAPTURE_INTERVAL_MS = 900;
const DEFAULT_CAPTURE_WIDTH = 320;
const LAST_FACE_DETECTED_STORAGE_KEY = 'table-pet-last-face-detected-at';

let socket: WebSocket | null = null;
let mediaStream: MediaStream | null = null;
let videoElement: HTMLVideoElement | null = null;
let canvasElement: HTMLCanvasElement | null = null;
let captureTimer: number | null = null;
let lastCompanionSettings: CompanionSettings = loadCompanionSettings();

function setStatus(next: VisionStatus) {
  status.value = next;
}

function persistLastFaceDetectedAt(value: number) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  if (value > 0) {
    window.localStorage.setItem(LAST_FACE_DETECTED_STORAGE_KEY, String(value));
    return;
  }

  window.localStorage.removeItem(LAST_FACE_DETECTED_STORAGE_KEY);
}

function normalizeBackendUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed || 'ws://127.0.0.1:8766';
}

function localizeMessage(message: string) {
  const locale = normalizeUiLanguage(loadCompanionSettings().uiLanguage);
  if (locale === 'zh-CN' && message === 'Unable to start the local backend service.') {
    return '无法启动本地后端服务。';
  }
  if (locale === 'zh-CN' && message === 'Unable to start the local backend service.') {
    return '无法启动本地后端服务。';
  }
  return localizeRuntimeText(locale, message);
}

function getVisionSessionConfig(settings: CompanionSettings) {
  return {
    sessionId: DEFAULT_SESSION_ID,
    visionBackend: settings.visionBackend,
    faceDetectionEnabled: settings.faceDetectionEnabled,
    expressionRecognitionEnabled: settings.expressionRecognitionEnabled,
    expressionModelPath: settings.expressionModelPath,
    gazeTrackingEnabled: settings.gazeTrackingEnabled,
    gestureRecognitionEnabled: settings.gestureRecognitionEnabled,
  };
}

function stopCaptureLoop() {
  if (captureTimer !== null) {
    window.clearInterval(captureTimer);
    captureTimer = null;
  }
}

function safelyRun(action: () => void) {
  try {
    action();
  } catch {
    return;
  }
}

function cleanupCamera() {
  stopCaptureLoop();

  if (videoElement) {
    safelyRun(() => {
      videoElement?.pause();
    });
    videoElement.srcObject = null;
    videoElement = null;
  }

  canvasElement = null;

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    mediaStream = null;
  }

  previewStream.value = null;
}

function resetVisionRuntimeState() {
  isActive.value = false;
  setStatus('idle');
  errorMessage.value = '';
  lastFaceState.value = null;
  lastGestures.value = [];
  backendLabel.value = '';
  lastFrameAt.value = 0;
  lastFaceDetectedAt.value = 0;
  persistLastFaceDetectedAt(0);
}

function disposeVisionRuntimeForReload() {
  stopCaptureLoop();

  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'vision_session_stop' }));
      }
    } catch {
      // Ignore websocket shutdown races during HMR disposal.
    }

    try {
      socket.close();
    } catch {
      // Ignore close failures during HMR disposal.
    }

    socket = null;
  }

  cleanupCamera();
  resetVisionRuntimeState();
}

async function createCameraFeed() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user',
    },
  });

  videoElement = document.createElement('video');
  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.playsInline = true;
  videoElement.srcObject = mediaStream;

  await new Promise<void>((resolve, reject) => {
    if (!videoElement) {
      reject(new Error('Camera video element was not created.'));
      return;
    }

    videoElement.onloadedmetadata = () => resolve();
    videoElement.onerror = () => reject(new Error('Unable to initialize camera feed.'));
  });

  await videoElement.play();
  canvasElement = document.createElement('canvas');
  previewStream.value = mediaStream;
}

function encodeCurrentFrame(): {
  imageBase64: string;
  width: number;
  height: number;
} | null {
  if (!videoElement || !canvasElement) {
    return null;
  }

  if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }

  const sourceWidth = videoElement.videoWidth;
  const sourceHeight = videoElement.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const scale = Math.min(1, DEFAULT_CAPTURE_WIDTH / sourceWidth);
  const targetWidth = Math.max(160, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(120, Math.round(sourceHeight * scale));

  canvasElement.width = targetWidth;
  canvasElement.height = targetHeight;

  const context = canvasElement.getContext('2d');
  if (!context) {
    return null;
  }

  context.drawImage(videoElement, 0, 0, targetWidth, targetHeight);
  const dataUrl = canvasElement.toDataURL('image/jpeg', 0.68);
  const imageBase64 = dataUrl.split(',')[1];
  if (!imageBase64) {
    return null;
  }

  return {
    imageBase64,
    width: targetWidth,
    height: targetHeight,
  };
}

function sendCurrentFrame() {
  if (socket?.readyState !== WebSocket.OPEN) {
    return;
  }

  const frame = encodeCurrentFrame();
  if (!frame) {
    return;
  }

  socket.send(
    JSON.stringify({
      type: 'vision_frame',
      imageBase64: frame.imageBase64,
      mimeType: 'image/jpeg',
      width: frame.width,
      height: frame.height,
      timestamp: Date.now(),
    }),
  );
}

function startCaptureLoop() {
  stopCaptureLoop();
  captureTimer = window.setInterval(() => {
    sendCurrentFrame();
  }, DEFAULT_CAPTURE_INTERVAL_MS);
}

async function handleSocketMessage(raw: string) {
  let payload: VisionSocketMessage;

  try {
    payload = JSON.parse(raw) as VisionSocketMessage;
  } catch {
    return;
  }

  if (payload.type === 'vision_session_ready') {
    backendLabel.value = payload.backend ?? '';

    if (payload.available === false) {
      isActive.value = false;
      stopCaptureLoop();
      errorMessage.value =
        localizeMessage(
          payload.reason || 'Vision backend is unavailable. Install perception dependencies first.',
        );
      setStatus('error');
      return;
    }

    isActive.value = true;
    errorMessage.value = '';
    setStatus('watching');
    startCaptureLoop();
    return;
  }

  if (payload.type === 'vision_state' && payload.state) {
    setStatus(payload.state);
    if (payload.state === 'idle') {
      isActive.value = false;
      stopCaptureLoop();
    }
    return;
  }

  if (payload.type === 'vision_face_state') {
    lastFaceState.value = payload.face ?? { detected: false };
    lastFrameAt.value = Date.now();
    if (payload.face?.detected) {
      lastFaceDetectedAt.value = lastFrameAt.value;
      persistLastFaceDetectedAt(lastFaceDetectedAt.value);
    }
    return;
  }

  if (payload.type === 'vision_gesture_state') {
    lastGestures.value = payload.gestures ?? [];
    return;
  }

  if (payload.type === 'vision_error') {
    errorMessage.value = localizeMessage(
      payload.message ?? 'Camera perception failed.',
    );
    isActive.value = false;
    stopCaptureLoop();
    setStatus('error');
  }
}

export const useVisionStore = defineStore('vision', () => {
  function reloadSettings() {
    lastCompanionSettings = loadCompanionSettings();

    if (
      !lastCompanionSettings.cameraEnabled &&
      (isActive.value || status.value === 'connecting' || status.value === 'watching')
    ) {
      void stop();
    }

    return lastCompanionSettings;
  }

  async function start() {
    const settings = reloadSettings();
    if (!settings.cameraEnabled) {
      errorMessage.value = localizeMessage('Camera perception is disabled in settings.');
      setStatus('error');
      return;
    }

    if (isActive.value || status.value === 'connecting') {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      errorMessage.value = localizeMessage('Camera capture is not available in this runtime.');
      setStatus('error');
      return;
    }

    setStatus('connecting');
    errorMessage.value = '';
    lastFaceState.value = null;
    lastGestures.value = [];
    lastFrameAt.value = 0;
    lastFaceDetectedAt.value = 0;
    persistLastFaceDetectedAt(0);

    try {
      await ensureBackendService({
        backendUrl: settings.chatBackendUrl,
        timeoutMs: 12000,
      });
      await createCameraFeed();

      socket = await new Promise<WebSocket>((resolve, reject) => {
        const nextSocket = new WebSocket(normalizeBackendUrl(settings.chatBackendUrl));
        let settled = false;

        nextSocket.onmessage = (event) => {
          void handleSocketMessage(String(event.data));
        };
        nextSocket.onopen = () => {
          if (settled) {
            return;
          }

          settled = true;
          nextSocket.send(
            JSON.stringify({
              type: 'vision_session_start',
              config: getVisionSessionConfig(settings),
            }),
          );
          resolve(nextSocket);
        };
        nextSocket.onerror = () => {
          errorMessage.value = localizeMessage('Vision websocket connection failed.');
          setStatus('error');

          if (!settled) {
            settled = true;
            reject(new Error('Vision websocket connection failed.'));
          }
        };
        nextSocket.onclose = () => {
          stopCaptureLoop();
          if (!settled) {
            settled = true;
            reject(new Error('Vision websocket connection closed before it was ready.'));
            return;
          }

          if (status.value !== 'idle') {
            errorMessage.value ||= localizeMessage('Vision websocket disconnected.');
            setStatus('error');
          }
          isActive.value = false;
        };
      });
    } catch (error) {
      cleanupCamera();
      socket?.close();
      socket = null;
      isActive.value = false;
      errorMessage.value =
        localizeMessage(
          error instanceof Error ? error.message : 'Unable to start camera perception.',
        );
      setStatus('error');
    }
  }

  async function stop() {
    isActive.value = false;
    setStatus('idle');
    errorMessage.value = '';
    lastFaceState.value = null;
    lastGestures.value = [];
    backendLabel.value = '';
    lastFrameAt.value = 0;
    lastFaceDetectedAt.value = 0;
    persistLastFaceDetectedAt(0);

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'vision_session_stop' }));
    }

    socket?.close();
    socket = null;
    cleanupCamera();
  }

  async function toggle() {
    if (isActive.value || status.value === 'connecting' || status.value === 'watching') {
      await stop();
      return;
    }

    await start();
  }

  return {
    status,
    isActive,
    errorMessage,
    lastFaceState,
    lastGestures,
    backendLabel,
    previewStream,
    lastFrameAt,
    lastFaceDetectedAt,
    start,
    stop,
    toggle,
    reloadSettings,
  };
});

function handleVisionRuntimeBeforeUnload() {
  disposeVisionRuntimeForReload();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', handleVisionRuntimeBeforeUnload);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleVisionRuntimeBeforeUnload);
    }

    disposeVisionRuntimeForReload();
  });
}
