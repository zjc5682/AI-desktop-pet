import {
  DesktopPetWebSocketChatClient,
  WebSocketChatProvider,
} from '@table-pet/providers';
import { BackendMemoryService, PersistentMemoryService } from '@table-pet/memory';
import { loadCompanionSettings } from '@table-pet/shared';
import { createDesktopCompanionCore } from './createDesktopCompanionCore';
import { desktopPetStageController } from '../stage/desktopPetStageController';
import { ensureBackendService } from '../utils/desktopCommands';

const BACKEND_ENSURE_COOLDOWN_MS = 1_500;

const rawChatClient = new DesktopPetWebSocketChatClient();
const rawMemory = new BackendMemoryService(
  () => loadCompanionSettings().chatBackendUrl,
  new PersistentMemoryService(),
);
const rawCore = createDesktopCompanionCore({
  chatProvider: new WebSocketChatProvider(rawChatClient),
  memory: rawMemory,
  stage: desktopPetStageController,
});

let lastEnsuredBackendUrl = '';
let lastBackendEnsureAt = 0;
let ensureBackendPromise: Promise<void> | null = null;

function isDesktopRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function bindValue<T extends object>(target: T, property: PropertyKey) {
  const value = Reflect.get(target, property, target);
  if (typeof value === 'function') {
    return value.bind(target);
  }
  return value;
}

export async function ensureDesktopRuntimeBackendReady(timeoutMs = 12_000) {
  if (!isDesktopRuntime()) {
    return;
  }

  const settings = loadCompanionSettings();
  const backendUrl = settings.chatBackendUrl.trim();
  const now = Date.now();

  if (
    ensureBackendPromise == null &&
    backendUrl &&
    backendUrl === lastEnsuredBackendUrl &&
    now - lastBackendEnsureAt < BACKEND_ENSURE_COOLDOWN_MS
  ) {
    return;
  }

  if (ensureBackendPromise) {
    return ensureBackendPromise;
  }

  ensureBackendPromise = (async () => {
    await ensureBackendService({
      backendUrl: settings.chatBackendUrl,
      timeoutMs,
    });
    lastEnsuredBackendUrl = backendUrl;
    lastBackendEnsureAt = Date.now();
  })().finally(() => {
    ensureBackendPromise = null;
  });

  return ensureBackendPromise;
}

const chatClient = new Proxy(rawChatClient, {
  get(target, property) {
    if (property === 'connect') {
      return async () => {
        await ensureDesktopRuntimeBackendReady();
        return target.connect();
      };
    }

    if (property === 'sendChatMessage') {
      return async (...args: unknown[]) => {
        await ensureDesktopRuntimeBackendReady();
        return target.sendChatMessage(
          args[0] as string,
          args[1] as Parameters<typeof target.sendChatMessage>[1],
          args[2] as Parameters<typeof target.sendChatMessage>[2],
        );
      };
    }

    return bindValue(target, property);
  },
}) as typeof rawChatClient;

const backendMemoryMethodsNeedingEnsure = new Set<string>([
  'saveMessage',
  'searchRelevant',
  'upsertProfileFact',
  'getProfileFacts',
  'getProfileSnapshot',
  'getRelationshipState',
  'appendDiary',
  'appendEventSummary',
  'getEventSummaries',
  'getConversation',
  'clearConversation',
  'getRuntimeStatus',
]);

const memory = new Proxy(rawMemory, {
  get(target, property) {
    if (
      typeof property === 'string' &&
      backendMemoryMethodsNeedingEnsure.has(property)
    ) {
      return async (...args: unknown[]) => {
        await ensureDesktopRuntimeBackendReady();
        const method = Reflect.get(target, property, target);
        if (typeof method !== 'function') {
          return method;
        }
        return method.apply(target, args);
      };
    }

    return bindValue(target, property);
  },
}) as typeof rawMemory;

const coreMethodsNeedingEnsure = new Set<string>(['dispatch', 'sendText', 'interrupt', 'tick']);

const core = new Proxy(rawCore, {
  get(target, property) {
    if (typeof property === 'string' && coreMethodsNeedingEnsure.has(property)) {
      return async (...args: unknown[]) => {
        await ensureDesktopRuntimeBackendReady();
        const method = Reflect.get(target, property, target);
        if (typeof method !== 'function') {
          return method;
        }
        return method.apply(target, args);
      };
    }

    return bindValue(target, property);
  },
}) as typeof rawCore;

export function getDesktopCompanionRuntime() {
  return {
    chatClient,
    core,
    memory,
    stage: desktopPetStageController,
  };
}
