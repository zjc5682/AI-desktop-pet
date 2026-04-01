<template>
  <canvas ref="canvas" class="live2d-canvas" data-tauri-drag-region></canvas>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as PIXI from 'pixi.js';
import type { LipSyncFrame, StageLookTarget } from '@table-pet/stage';

interface Props {
  modelPath: string;
  width: number;
  height: number;
  isSleeping: boolean;
}

interface Emits {
  (e: 'model-loaded', model: any): void;
  (e: 'motion-played', motionType: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const canvas = ref<HTMLCanvasElement | null>(null);
let app: PIXI.Application | null = null;
let model: any = null;
let Live2DModelCtor: {
  from(source: string, options?: Record<string, unknown>): Promise<any>;
} | null = null;
const MODEL_TICK_PRIORITY =
  typeof PIXI.UPDATE_PRIORITY?.HIGH === 'number' ? PIXI.UPDATE_PRIORITY.HIGH : 50;

const loadScript = async (src: string, ready: () => boolean) => {
  if (ready()) {
    return;
  }

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${src}"]`,
  );

  if (existingScript) {
    await new Promise<void>((resolve, reject) => {
      if (ready()) {
        resolve();
        return;
      }

      const handleLoad = () => resolve();
      const handleError = () => reject(new Error(`Failed to load ${src}.`));

      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}.`));
    document.head.appendChild(script);
  });
};

const ensureLive2DRuntime = async () => {
  const runtimeWindow = window as Window & {
    Live2D?: unknown;
    Live2DCubismCore?: unknown;
    live2d?: unknown;
    PIXI?: typeof PIXI;
  };

  runtimeWindow.PIXI = PIXI;

  await loadScript('/libs/live2d.min.js', () => Boolean(runtimeWindow.Live2D));
  await loadScript(
    '/libs/live2dcubismcore.min.js',
    () => Boolean(runtimeWindow.Live2DCubismCore),
  );
  runtimeWindow.live2d = runtimeWindow.Live2D;

  if (!runtimeWindow.Live2D) {
    throw new Error('Live2D Cubism 2 runtime did not load.');
  }

  if (!Live2DModelCtor) {
    const live2dModule = await import('pixi-live2d-display');
    Live2DModelCtor = live2dModule.Live2DModel;
  }
};

const resizeModel = () => {
  if (!model || !app) {
    return;
  }

  const baseHeight = 1080;
  let scale = (props.height / baseHeight) * 0.5;
  scale = Math.max(0.2, Math.min(0.8, scale));

  model.scale.set(scale);
  model.anchor.set(0.5, 0.5);
  model.x = props.width / 2;
  model.y = props.height / 2;
};

const cleanupModel = () => {
  if (!app || !model) {
    model = null;
    return;
  }

  if ('autoUpdate' in model) {
    model.autoUpdate = false;
  }
  app.stage.removeChild(model);
  if (typeof model.destroy === 'function') {
    model.destroy();
  }
  model = null;
};

const tickModelFrame = (deltaMs = 16.67) => {
  if (!model || typeof model.update !== 'function') {
    return;
  }

  model.update(Math.max(1, deltaMs));
};

const handleModelTicker = () => {
  tickModelFrame(app?.ticker.deltaMS ?? 16.67);
};

const registerModelTicker = () => {
  if (!app) {
    return;
  }

  app.ticker.remove(handleModelTicker);
  app.ticker.add(handleModelTicker, undefined, MODEL_TICK_PRIORITY);
};

const unregisterModelTicker = () => {
  app?.ticker.remove(handleModelTicker);
};

const playInitialMotion = () => {
  if (!model?.motions) {
    return;
  }

  if (model.motions.idle?.length) {
    model.motion(model.motions.idle[0]);
    return;
  }

  const fallbackAnimations = ['rest', 'talk', 'tap_body', 'flick_head'];
  for (const name of fallbackAnimations) {
    if (model.motions[name]?.length) {
      model.motion(model.motions[name][0]);
      return;
    }
  }
};

const loadModel = async (modelPath: string) => {
  if (!app || !Live2DModelCtor) {
    return;
  }

  if (!modelPath) {
    cleanupModel();
    return;
  }

  if (model && model.modelJsonUrl === modelPath) {
    resizeModel();
    return;
  }

  cleanupModel();

  try {
    model = await Live2DModelCtor.from(modelPath, {
      autoUpdate: false,
      autoInteract: false,
    });
    model.modelJsonUrl = modelPath;
    model.autoUpdate = false;
    tickModelFrame();
    app.stage.addChild(model);
    resizeModel();
    playInitialMotion();
    app.render();
    emit('model-loaded', model);
  } catch (error) {
    console.error('Failed to load Live2D model:', error);
  }
};

const playMotion = async (motionType: string, index?: number) => {
  if (!model?.motions?.[motionType]) {
    return;
  }

  const motions = model.motions[motionType];
  if (!motions.length) {
    return;
  }

  const motionIndex =
    typeof index === 'number'
      ? Math.max(0, Math.min(index, motions.length - 1))
      : Math.floor(Math.random() * motions.length);

  await model.motion(motions[motionIndex]);
  emit('motion-played', motionType);
};

const playExpression = async (name: string) => {
  if (!model || typeof model.expression !== 'function') {
    return;
  }
  await model.expression(name);
};

const setLookTarget = (target: StageLookTarget) => {
  if (!model) {
    return;
  }

  try {
    const live2dModel = model.model || model.internalModel || model._model;
    const coreModel =
      live2dModel?.coreModel ||
      live2dModel?._coreModel ||
      live2dModel?.internalCore;

    if (coreModel && typeof coreModel.setParameterValueById === 'function') {
      coreModel.setParameterValueById('ParamAngleX', target.x);
      coreModel.setParameterValueById('ParamAngleY', target.y);
      coreModel.setParameterValueById('ParamEyeBallX', target.x * 0.8);
      coreModel.setParameterValueById('ParamEyeBallY', target.y * 0.8);
    }
  } catch (error) {
    console.error('Failed to update gaze target:', error);
  }
};

const syncLipSync = (frame: LipSyncFrame) => {
  if (!model) {
    return;
  }

  try {
    const live2dModel = model.model || model.internalModel || model._model;
    const coreModel =
      live2dModel?.coreModel ||
      live2dModel?._coreModel ||
      live2dModel?.internalCore;

    if (coreModel && typeof coreModel.setParameterValueById === 'function') {
      coreModel.setParameterValueById(
        'ParamMouthOpenY',
        Math.max(0, Math.min(1, frame.energy)),
      );
    }
  } catch (error) {
    console.error('Failed to sync lip animation:', error);
  }
};

const getHitAreaCoords = (event: MouseEvent) => {
  if (!canvas.value) {
    return { x: 0, y: 0 };
  }

  const rect = canvas.value.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  return { x, y };
};

defineExpose({
  playMotion,
  playExpression,
  setLookTarget,
  syncLipSync,
  getHitAreaCoords,
  canvas,
});

watch(
  () => props.modelPath,
  (modelPath) => {
    void loadModel(modelPath);
  },
  { immediate: true },
);

watch(
  () => [props.width, props.height],
  ([newWidth, newHeight]) => {
    if (!app || !canvas.value) {
      return;
    }

    app.renderer.resize(newWidth, newHeight);
    resizeModel();
  },
  { immediate: true },
);

watch(
  () => props.isSleeping,
  (isSleeping) => {
    if (isSleeping && model?.motions?.sleepy) {
      void playMotion('sleepy');
    }
  },
);

onMounted(() => {
  if (!canvas.value) {
    return;
  }

  void (async () => {
    try {
      await ensureLive2DRuntime();

      app = new PIXI.Application({
        view: canvas.value!,
        backgroundColor: 0x000000,
        backgroundAlpha: 0,
        width: props.width,
        height: props.height,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        autoStart: false,
        sharedTicker: false,
      });

      app.ticker.stop();
      registerModelTicker();
      app.ticker.start();
      await loadModel(props.modelPath);
    } catch (error) {
      console.error('Failed to initialize Live2D canvas:', error);
    }
  })();
});

onUnmounted(() => {
  app?.ticker.stop();
  unregisterModelTicker();
  cleanupModel();
  app?.destroy(true);
  app = null;
});
</script>

<style scoped>
.live2d-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  background-color: transparent !important;
  pointer-events: none;
}
</style>
