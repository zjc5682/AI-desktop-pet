<template>
  <canvas ref="canvas" class="live2d-canvas"></canvas>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import * as PIXI from 'pixi.js';
import { useLive2DStore } from '../stores/live2d';
import { parseModelJson } from '../utils/live2dParser';

const store = useLive2DStore();
const canvas = ref<HTMLCanvasElement | null>(null);
let app: PIXI.Application | null = null;
let model: any = null;
let Live2DModel: any = null;

const loadModel = async () => {
  if (!app || !Live2DModel) {
    console.log('PIXI Application 或 Live2DModel 未初始化');
    return;
  }

  let modelJsonUrl: string | null = null;

  console.log('useDefaultModel:', store.useDefaultModel, 'currentModel:', store.currentModel);

  if (store.useDefaultModel) {
    modelJsonUrl = store.getDefaultModelUrl();
    console.log('加载默认模型:', modelJsonUrl);
  } else if (!store.currentModel) {
    return;
  } else {
    const basePath = `asset://localhost/live2d_models/${store.currentModel}/`;
    modelJsonUrl = await findModelJson(basePath);
  }

  if (!modelJsonUrl) {
    console.error('未找到模型 JSON 文件');
    return;
  }

  if (model && (model as any).modelJsonUrl === modelJsonUrl) {
    console.log('模型已加载，跳过');
    return;
  }

  if (model) {
    app.stage.removeChild(model);
    model.destroy();
    model = null;
  }

  try {
    console.log('开始加载模型:', modelJsonUrl);
    const startTime = performance.now();
    model = await Live2DModel.from(modelJsonUrl);
    (model as any).modelJsonUrl = modelJsonUrl;

    app.stage.addChild(model);
    model.x = app.screen.width / 2;
    model.y = app.screen.height;
    model.anchor.set(0.5, 1);

    const { motions, expressions } = await parseModelJson(modelJsonUrl);
    store.motions = Object.entries(motions).flatMap(([group, files]) =>
      files.map(file => ({ group, file, isExpression: false }))
    );
    store.expressions = expressions;

    const endTime = performance.now();
    console.log(`模型加载完成，耗时：${((endTime - startTime) / 1000).toFixed(2)}秒`);
  } catch (err) {
    console.error('模型加载失败', err);
  }
};

const findModelJson = async (basePath: string): Promise<string | null> => {
  const candidates = ['model.json', 'model3.json'];
  for (const cand of candidates) {
    const url = `${basePath}${cand}`;
    try {
      const res = await fetch(url);
      if (res.ok) return url;
    } catch {}
  }
  return null;
};

watch(() => [store.currentModel, store.useDefaultModel], loadModel, { immediate: true });

onMounted(async () => {
  if (!canvas.value) return;

  const startTime = performance.now();

  const modulePromise = import('pixi-live2d-display');
  const corePromise = import('live2dcubismcore');

  const [, module] = await Promise.all([
    corePromise,
    modulePromise
  ]);

  Live2DModel = module.Live2DModel;

  (window as any).PIXI = PIXI;

  app = new PIXI.Application({
    view: canvas.value,
    width: window.innerWidth,
    height: window.innerHeight,
    transparent: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
    antialias: true,
  });

  window.addEventListener('resize', onResize);

  requestAnimationFrame(() => {
    loadModel();
  });

  const endTime = performance.now();
  console.log(`Live2D 组件初始化完成，耗时：${((endTime - startTime) / 1000).toFixed(2)}秒`);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  app?.destroy(true);
});

function onResize() {
  if (app) {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    if (model) {
      model.x = app.screen.width / 2;
      model.y = app.screen.height;
    }
  }
}

defineExpose({
  playMotion: async (group: string, index: number = 0) => {
    if (model) await model.motion(group, index);
  },
  playExpression: async (name: string) => {
    if (model) await model.expression(name);
  },
});
</script>

<style scoped>
.live2d-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
</style>
