<template>
  <main class="selector-shell" @pointerdown="handlePointerDown">
    <section class="selector-hud">
      <p class="selector-title">{{ titleText }}</p>
      <p class="selector-copy">{{ copyText }}</p>
      <p class="selector-meta">
        {{ metaText }}
        <span v-if="selectionLabel">{{ selectionLabel }}</span>
      </p>
    </section>

    <div v-if="selection" class="selection-box" :style="selectionStyle">
      <span class="selection-badge">{{ selectionLabel }}</span>
    </div>
  </main>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { loadCompanionSettings } from '@table-pet/shared';
import type { ScreenshotCaptureRegion } from './utils/desktopCommands';
import { emitRuntimeEvent, listenRuntimeEvent } from './utils/runtimeEvents';

type UiLanguage = 'en' | 'zh-CN';

interface Point {
  x: number;
  y: number;
}

interface SelectionBox extends ScreenshotCaptureRegion {}

const MIN_SELECTION_SIZE = 8;

const locale = ref<UiLanguage>(
  loadCompanionSettings().uiLanguage === 'zh-CN' ? 'zh-CN' : 'en',
);
const scaleFactor = ref(window.devicePixelRatio || 1);
const selection = ref<SelectionBox | null>(null);
const dragStart = ref<Point | null>(null);
const dragging = ref(false);

let unlistenSelectionOpen: (() => void) | null = null;

const titleText = computed(() =>
  locale.value === 'zh-CN'
    ? '\u6846\u9009\u622a\u56fe\u533a\u57df'
    : 'Select Screenshot Area',
);
const copyText = computed(() =>
  locale.value === 'zh-CN'
    ? '\u6309\u4f4f\u5de6\u952e\u62d6\u51fa\u8981\u7ffb\u8bd1\u7684\u8303\u56f4\uff0c\u6309 Esc \u53d6\u6d88\u3002'
    : 'Drag with the left mouse button to choose the area. Press Esc to cancel.',
);
const metaText = computed(() =>
  locale.value === 'zh-CN'
    ? '\u4ec5\u622a\u53d6\u9009\u533a\uff0c\u4e0d\u518d\u5168\u5c4f\u76f2\u622a\u3002'
    : 'Only the selected region will be captured.',
);
const selectionLabel = computed(() => {
  if (!selection.value) {
    return '';
  }

  return `${selection.value.width} x ${selection.value.height}`;
});
const selectionStyle = computed(() => {
  if (!selection.value) {
    return {};
  }

  return {
    left: `${selection.value.x}px`,
    top: `${selection.value.y}px`,
    width: `${selection.value.width}px`,
    height: `${selection.value.height}px`,
  };
});

function normalizeBox(start: Point, end: Point): SelectionBox {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  return {
    x: left,
    y: top,
    width,
    height,
  };
}

async function hideSelector() {
  const currentWindow = getCurrentWindow();
  await currentWindow.hide();
}

async function refreshWindowMetrics() {
  const currentWindow = getCurrentWindow();
  scaleFactor.value = await currentWindow.scaleFactor();
  return await currentWindow.innerPosition();
}

async function emitSelectionResult(
  cancelled: boolean,
  region: ScreenshotCaptureRegion | null,
) {
  await emitRuntimeEvent('screenshot-selection-result', {
    cancelled,
    region,
  });
}

async function cancelSelection() {
  dragging.value = false;
  selection.value = null;
  dragStart.value = null;
  await hideSelector();
  await emitSelectionResult(true, null);
}

async function confirmSelection() {
  const currentSelection = selection.value;
  dragging.value = false;
  dragStart.value = null;

  if (
    !currentSelection ||
    currentSelection.width < MIN_SELECTION_SIZE ||
    currentSelection.height < MIN_SELECTION_SIZE
  ) {
    await cancelSelection();
    return;
  }

  const windowPosition = await refreshWindowMetrics();
  const region = {
    x: Math.round(windowPosition.x + currentSelection.x * scaleFactor.value),
    y: Math.round(windowPosition.y + currentSelection.y * scaleFactor.value),
    width: Math.round(currentSelection.width * scaleFactor.value),
    height: Math.round(currentSelection.height * scaleFactor.value),
  };

  await hideSelector();
  await emitSelectionResult(false, region);
}

function handlePointerMove(event: PointerEvent) {
  if (!dragging.value || !dragStart.value) {
    return;
  }

  selection.value = normalizeBox(dragStart.value, {
    x: event.clientX,
    y: event.clientY,
  });
}

function handlePointerUp(event: PointerEvent) {
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);

  if (!dragging.value || !dragStart.value) {
    return;
  }

  selection.value = normalizeBox(dragStart.value, {
    x: event.clientX,
    y: event.clientY,
  });
  void confirmSelection();
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  dragging.value = true;
  dragStart.value = {
    x: event.clientX,
    y: event.clientY,
  };
  selection.value = {
    x: event.clientX,
    y: event.clientY,
    width: 0,
    height: 0,
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') {
    return;
  }

  event.preventDefault();
  void cancelSelection();
}

onMounted(async () => {
  await refreshWindowMetrics();
  unlistenSelectionOpen = await listenRuntimeEvent(
    'screenshot-selection-open',
    async (payload) => {
      locale.value = payload.language;
      selection.value = null;
      dragging.value = false;
      dragStart.value = null;
      await refreshWindowMetrics();
    },
  );
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  unlistenSelectionOpen?.();
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style scoped>
:global(html, body, #app) {
  width: 100%;
  height: 100%;
}

:global(body) {
  margin: 0;
  background: transparent;
  overflow: hidden;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  cursor: crosshair;
  user-select: none;
}

.selector-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  background:
    linear-gradient(rgba(6, 10, 20, 0.22), rgba(6, 10, 20, 0.22)),
    rgba(10, 14, 24, 0.12);
}

.selector-hud {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 360px;
  max-width: min(92vw, 680px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(8, 14, 24, 0.82);
  backdrop-filter: blur(12px);
  color: #f5f8ff;
  padding: 16px 18px;
  box-shadow: 0 18px 36px rgba(2, 6, 12, 0.26);
}

.selector-title,
.selector-copy,
.selector-meta {
  margin: 0;
}

.selector-title {
  font-size: 18px;
  font-weight: 700;
}

.selector-copy {
  margin-top: 6px;
  color: rgba(245, 248, 255, 0.8);
  font-size: 14px;
}

.selector-meta {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(154, 214, 255, 0.9);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.selection-box {
  position: absolute;
  border: 2px solid rgba(111, 216, 255, 0.96);
  border-radius: 14px;
  background: rgba(77, 180, 255, 0.16);
  box-shadow:
    0 0 0 9999px rgba(8, 12, 20, 0.36),
    0 0 0 1px rgba(255, 255, 255, 0.16) inset;
}

.selection-badge {
  position: absolute;
  top: -34px;
  right: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(8, 14, 24, 0.9);
  color: #f5f8ff;
  font-size: 12px;
  letter-spacing: 0.02em;
}

@media (max-width: 720px) {
  .selector-hud {
    min-width: 0;
    width: calc(100vw - 24px);
    top: 12px;
  }
}
</style>
