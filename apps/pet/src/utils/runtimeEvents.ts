import { emit, listen } from '@tauri-apps/api/event';
import type { RelationshipState } from '@table-pet/memory';
import type { ScreenshotTranslationResult } from '../stores/screenshotTranslation';
import type { ScreenshotCaptureRegion } from './desktopCommands';

export type RuntimeEventMap = {
  'settings-changed': Record<string, unknown>;
  'companion-settings-changed': Record<string, unknown>;
  'stage-preview-motion': string;
  'stage-preview-expression': string;
  'proactive-reminder': {
    kind: string;
    message: string;
    timestamp: string;
  };
  'desktop-insight': {
    kind: string;
    message: string;
    summary: string;
    timestamp: string;
  };
  'desktop-warning': {
    kind: string;
    message: string;
    summary: string;
    timestamp: string;
    severity?: 'info' | 'warning' | 'critical';
  };
  'relationship-state': RelationshipState;
  'shortcut-voice-record': {
    phase: 'pressed' | 'released';
  };
  'shortcut-screenshot-translate': Record<string, never>;
  'screenshot-selection-open': {
    language: 'en' | 'zh-CN';
  };
  'screenshot-selection-result': {
    cancelled: boolean;
    region: ScreenshotCaptureRegion | null;
  };
  'screenshot-translation-result': ScreenshotTranslationResult;
};

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function emitRuntimeEvent<TEvent extends keyof RuntimeEventMap>(
  name: TEvent,
  payload: RuntimeEventMap[TEvent],
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('Desktop runtime events require Tauri.');
  }

  await emit(name, payload);
}

export async function listenRuntimeEvent<TEvent extends keyof RuntimeEventMap>(
  name: TEvent,
  handler: (payload: RuntimeEventMap[TEvent]) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    throw new Error('Desktop runtime events require Tauri.');
  }

  const unlisten = await listen<RuntimeEventMap[TEvent]>(name, (event) => {
    handler(event.payload);
  });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      try {
        unlisten();
      } catch {
        // Ignore dev-time teardown noise during HMR.
      }
    });
  }

  return () => {
    try {
      unlisten();
    } catch {
      // Ignore late unlisten calls when the webview has already reloaded.
    }
  };
}
