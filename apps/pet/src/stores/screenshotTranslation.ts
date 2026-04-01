import { defineStore } from 'pinia';
import { ref } from 'vue';
import { loadCompanionSettings, type CompanionSettings } from '@table-pet/shared';
import {
  capturePrimaryScreen,
  type ScreenshotCaptureRegion,
  type ScreenshotCaptureResult,
} from '../utils/desktopCommands';
import {
  emitRuntimeEvent,
  isTauriRuntime,
  listenRuntimeEvent,
} from '../utils/runtimeEvents';

type ScreenshotTranslationStatus = 'idle' | 'capturing' | 'processing' | 'error';
type ScreenshotSelectionMode = 'fullscreen' | 'region';

const SCREENSHOT_SELECTOR_LABEL = 'capture_selector';
const SCREENSHOT_SELECTOR_HIDE_DELAY_MS = 120;
const SCREENSHOT_SELECTOR_TIMEOUT_MS = 60_000;

export class ScreenshotSelectionCancelledError extends Error {
  constructor() {
    super('');
    this.name = 'ScreenshotSelectionCancelledError';
  }
}

export interface ScreenshotTranslationResult {
  capturedAt: string;
  width: number;
  height: number;
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  lines: Array<{
    text: string;
    score?: number | null;
  }>;
  error?: string;
}

function normalizeBackendUrl(settings: CompanionSettings): string {
  return settings.chatBackendUrl.trim() || 'ws://127.0.0.1:8766';
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

function waitFor(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function getWindowByLabel(label: string) {
  if (!isTauriRuntime()) {
    return null;
  }

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  return WebviewWindow.getByLabel(label);
}

async function setMainWindowVisibility(visible: boolean): Promise<boolean> {
  const mainWindow = await getWindowByLabel('main');
  if (!mainWindow) {
    return false;
  }

  const wasVisible = await mainWindow.isVisible();
  if (visible) {
    if (!wasVisible) {
      await mainWindow.show();
      await mainWindow.setFocus();
    }
    return wasVisible;
  }

  if (wasVisible) {
    await mainWindow.hide();
  }
  return wasVisible;
}

async function selectScreenshotRegion(
  settings: CompanionSettings,
): Promise<ScreenshotCaptureRegion> {
  if (!isTauriRuntime()) {
    throw new Error('Region screenshot selection requires the desktop runtime.');
  }

  const selectorWindow = await getWindowByLabel(SCREENSHOT_SELECTOR_LABEL);
  if (!selectorWindow) {
    throw new Error('Screenshot selector window is unavailable.');
  }

  return await new Promise<ScreenshotCaptureRegion>((resolve, reject) => {
    let settled = false;
    let timeoutHandle = 0;
    let unlisten: (() => void) | null = null;

    const finalize = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutHandle) {
        window.clearTimeout(timeoutHandle);
      }
      unlisten?.();
      callback();
    };

    timeoutHandle = window.setTimeout(() => {
      void selectorWindow.hide();
      finalize(() => {
        reject(new Error('Screenshot selection timed out.'));
      });
    }, SCREENSHOT_SELECTOR_TIMEOUT_MS);

    void (async () => {
      try {
        unlisten = await listenRuntimeEvent(
          'screenshot-selection-result',
          async (payload) => {
            const region = payload.region;
            if (payload.cancelled || !region) {
              finalize(() => {
                reject(new ScreenshotSelectionCancelledError());
              });
              return;
            }

            await waitFor(SCREENSHOT_SELECTOR_HIDE_DELAY_MS);
            finalize(() => {
              resolve(region);
            });
          },
        );

        await selectorWindow.show();
        await selectorWindow.setFocus();
        await emitRuntimeEvent('screenshot-selection-open', {
          language: settings.uiLanguage === 'zh-CN' ? 'zh-CN' : 'en',
        });
      } catch (error) {
        void selectorWindow.hide();
        finalize(() => {
          reject(
            error instanceof Error
              ? error
              : new Error('Unable to open the screenshot selector.'),
          );
        });
      }
    })();
  });
}

async function requestScreenshotTranslation(
  backendUrl: string,
  screenshot: ScreenshotCaptureResult,
  settings: CompanionSettings,
): Promise<ScreenshotTranslationResult> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(backendUrl);
    let settled = false;

    const finalize = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
      socket.close();
    };

    socket.onerror = () => {
      finalize(() => {
        reject(new Error('Screenshot translation websocket failed.'));
      });
    };

    socket.onclose = () => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error('Screenshot translation websocket closed before completion.'));
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data ?? '{}')) as Record<string, unknown>;
        if (payload.type === 'error') {
          finalize(() => {
            reject(new Error(String(payload.message || 'Screenshot translation failed.')));
          });
          return;
        }

        if (payload.type === 'screenshot_translate_result') {
          finalize(() => {
            resolve({
              capturedAt: new Date().toISOString(),
              width: screenshot.width,
              height: screenshot.height,
              originalText: String(payload.originalText || ''),
              translatedText: String(payload.translatedText || ''),
              targetLanguage: String(payload.targetLanguage || settings.uiLanguage),
              lines: Array.isArray(payload.lines)
                ? payload.lines
                    .filter(
                      (item): item is { text: string; score?: number | null } =>
                        Boolean(item) && typeof item === 'object' && 'text' in item,
                    )
                    .map((item) => ({
                      text: String(item.text || ''),
                      score:
                        typeof item.score === 'number' ? item.score : null,
                    }))
                : [],
              error:
                typeof payload.error === 'string' && payload.error
                  ? payload.error
                  : undefined,
            });
          });
        }
      } catch (error) {
        finalize(() => {
          reject(error instanceof Error ? error : new Error('Invalid screenshot translation response.'));
        });
      }
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'screenshot_translate',
          imageBase64: screenshot.imageBase64,
          mimeType: screenshot.mimeType,
          targetLanguage: settings.uiLanguage,
          providerConfig: buildProviderConfig(settings),
        }),
      );
    };
  });
}

export const useScreenshotTranslationStore = defineStore('screenshotTranslation', () => {
  const status = ref<ScreenshotTranslationStatus>('idle');
  const lastResult = ref<ScreenshotTranslationResult | null>(null);
  const errorMessage = ref('');

  async function captureAndTranslate(options?: {
    hideMainWindow?: boolean;
    selectionMode?: ScreenshotSelectionMode;
  }) {
    const settings = loadCompanionSettings();
    const selectionMode = options?.selectionMode ?? 'fullscreen';
    status.value = 'capturing';
    errorMessage.value = '';
    let shouldRestoreMainWindow = false;

    try {
      let region: ScreenshotCaptureRegion | null = null;
      if (selectionMode === 'region') {
        shouldRestoreMainWindow =
          (options?.hideMainWindow ?? true) && (await setMainWindowVisibility(false));
        if (shouldRestoreMainWindow) {
          await waitFor(SCREENSHOT_SELECTOR_HIDE_DELAY_MS);
        }
        region = await selectScreenshotRegion(settings);
      }

      const screenshot = await capturePrimaryScreen({
        hideMainWindow:
          selectionMode === 'fullscreen' ? options?.hideMainWindow ?? true : false,
        region,
      });
      status.value = 'processing';
      const result = await requestScreenshotTranslation(
        normalizeBackendUrl(settings),
        screenshot,
        settings,
      );
      lastResult.value = result;
      status.value = result.error ? 'error' : 'idle';
      errorMessage.value = result.error ?? '';

      if (isTauriRuntime()) {
        await emitRuntimeEvent('screenshot-translation-result', result);
      }

      return result;
    } catch (error) {
      if (error instanceof ScreenshotSelectionCancelledError) {
        status.value = 'idle';
        errorMessage.value = '';
        throw error;
      }

      status.value = 'error';
      errorMessage.value =
        error instanceof Error ? error.message : 'Screenshot translation failed.';
      throw error;
    } finally {
      if (shouldRestoreMainWindow) {
        await waitFor(SCREENSHOT_SELECTOR_HIDE_DELAY_MS);
        await setMainWindowVisibility(true);
      }
    }
  }

  function clear() {
    lastResult.value = null;
    errorMessage.value = '';
    status.value = 'idle';
  }

  return {
    status,
    lastResult,
    errorMessage,
    captureAndTranslate,
    clear,
  };
});
