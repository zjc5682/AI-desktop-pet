<!--
  Live2DCanvas.vue - Live2D 画布组件
  功能：负责 Live2D 模型的加载、渲染和动画播放
  
  核心职责：
  1. 创建 PIXI.js 渲染上下文
  2. 加载 Live2D 模型（支持 Cubism 2/3/4）
  3. 调整模型大小和位置
  4. 播放各种动作动画（待机、点击、睡眠等）
  5. 向父组件暴露模型控制方法
-->
<template>
  <canvas ref="canvas" class="live2d-canvas" data-tauri-drag-region></canvas>
</template>

<script setup lang="ts">
/**
 * ========================================
 * 导入依赖
 * ========================================
 */
import { onMounted, ref, watch } from 'vue';
import * as PIXI from 'pixi.js';  // PIXI.js 图形渲染库
import { Live2DModel } from 'pixi-live2d-display';  // 支持 Cubism 2/3/4 所有版本

/**
 * ========================================
 * Props 和 Emits 定义
 * ========================================
 */
interface Props {
  modelPath: string;    // Live2D 模型的 model.json 路径
  width: number;        // 画布宽度（像素）- 现在是响应式的
  height: number;       // 画布高度（像素）- 现在是响应式的
  isSleeping: boolean;  // 是否处于睡眠状态
}

interface Emits {
  (e: 'model-loaded', model: any): void;  // 模型加载完成回调
  (e: 'motion-played', motionType: string): void;  // 动画播放完成回调
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Canvas DOM 引用
const canvas = ref<HTMLCanvasElement | null>(null);
// PIXI.js 应用实例
let app: PIXI.Application | null = null;
// Live2D 模型实例
let model: any = null;

/**
 * ========================================
 * 暴露给父组件的方法
 * ========================================
 */

/**
 * 播放指定类型的动画
 * @param motionType - 动画类型（如 'idle', 'tap_body', 'flick_head' 等）
 */
const playMotion = (motionType: string) => {
  if (!model || !model.motions || !model.motions[motionType]) return;
  
  // 从该类型的动画列表中随机选择一个播放
  const motions = model.motions[motionType];
  if (motions && motions.length > 0) {
    const randomIndex = Math.floor(Math.random() * motions.length);
    model.motion(motions[randomIndex]);  // 播放动画
    emit('motion-played', motionType);   // 通知父组件
  }
};

/**
 * 获取鼠标在画布上的归一化坐标
 * 将屏幕坐标转换为 Live2D 坐标系 (-1 ~ 1)
 * @param e - 鼠标事件对象
 * @returns 归一化后的坐标 {x, y}
 */
const getHitAreaCoords = (e: MouseEvent) => {
  if (!canvas.value) return { x: 0, y: 0 };
  
  const rect = canvas.value.getBoundingClientRect();
  // X 轴：从左到右 -1 ~ 1
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  // Y 轴：从下到上 -1 ~ 1（注意 Live2D 的 Y 轴是向上的）
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  
  return { x, y };
};

// 暴露公共方法给父组件调用
defineExpose({
  playMotion,         // 播放动画
  getHitAreaCoords,   // 获取归一化坐标
  canvas             // Canvas DOM 引用
});

/**
 * ========================================
 * 生命周期钩子：组件挂载后初始化
 * ========================================
 * 功能：
 * 1. 创建 PIXI.js 应用
 * 2. 加载 Live2D 模型
 * 3. 调整模型大小和位置
 * 4. 播放初始待机动画
 */
onMounted(async () => {
  if (!canvas.value) return;

  // 将 PIXI 挂载到全局 window 对象，供 pixi-live2d-display 使用
  (window as any).PIXI = PIXI;

  // 创建 PIXI.js 应用实例
  app = new PIXI.Application({
    view: canvas.value,        // 绑定到 canvas 元素
    backgroundColor: 0x000000, // 黑色背景（但会被设为透明）
    backgroundAlpha: 0,        // 完全透明背景
    width: props.width,        // 画布宽度
    height: props.height,      // 画布高度
    autoDensity: true,         // 自动密度适配
    resolution: window.devicePixelRatio || 1,  // 设备像素比
  });

  // 启动渲染循环
  app.ticker.start();

  try {
    // 使用 pixi-live2d-display 加载 Live2D 模型
    model = await Live2DModel.from(props.modelPath);
    console.log('✅ Canvas: 模型加载成功');
    
    // 等待一小段时间让 motions 动画数据完全初始化
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 将模型添加到渲染舞台
    app.stage.addChild(model);
    model.autoUpdate = true;  // 启用自动更新（每帧重绘）
    
    // 调整模型大小和位置到合适位置
    resizeModel();
    
    // 通知父组件模型已加载完成
    emit('model-loaded', model);
    
    // 播放待机动画（优先 idle，没有则使用备选动画）
    if (model && model.motions) {
      if (model.motions.idle && model.motions.idle.length > 0) {
        console.log(`✅ Canvas: 播放 idle 动画，数量：${model.motions.idle.length}`);
        model.motion(model.motions.idle[0]);
      } else {
        console.warn('⚠️ Canvas: 未找到 idle 动画');
        // 备选动画列表
        const fallbackAnimations = ['rest', 'talk', 'tap_body', 'flick_head'];
        for (const animName of fallbackAnimations) {
          if (model.motions[animName] && model.motions[animName].length > 0) {
            console.log(`✅ Canvas: 播放备选动画 ${animName}`);
            model.motion(model.motions[animName][0]);
            break;
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Canvas: 模型加载失败:', error);
  }
});

/**
 * 调整模型大小和位置
 * 根据画布尺寸动态计算合适的缩放比例
 */
const resizeModel = () => {
  if (!model || !app) return;
  
  // 使用原始简单计算方法（参考 zhangjuncehng-666niubidaw-master 项目）
  const baseHeight = 1080;  // 基准高度
  let scale = (props.height / baseHeight) * 0.5;  // 基础缩放系数 0.5
  
  // 限制缩放范围
  scale = Math.max(0.2, Math.min(0.8, scale));
  
  console.log(`🔧 调整模型：画布 ${props.width}x${props.height}, 缩放比例 ${scale.toFixed(3)}`);

  model.scale.set(scale);     // 设置缩放比例
  model.anchor.set(0.5, 0.5);   // 锚点：正中心（修复：从底部中心改为正中心）
  model.x = props.width / 2;  // 水平居中
  model.y = props.height / 2;  // Y 轴：垂直居中（修复：从底部对齐改为居中）
};

/**
 * ========================================
 * 监听器设置
 * ========================================
 */

// 监听画布尺寸变化，自动调整渲染器和模型大小
watch(() => [props.width, props.height], (newSize, oldSize) => {
  if (!app || !canvas.value) return;
  
  const [newWidth, newHeight] = newSize;
  // 修复：首次执行时 oldSize 为 undefined，需要默认值
  const oldWidth = oldSize?.[0] ?? 0;
  const oldHeight = oldSize?.[1] ?? 0;
  
  console.log(`📐 画布尺寸变化：${oldWidth}x${oldHeight} -> ${newWidth}x${newHeight}`);
  
  // 调整渲染器尺寸
  app.renderer.resize(newWidth, newHeight);
  
  // 重新调整模型大小和位置
  resizeModel();
}, { immediate: true });  // 立即执行一次，确保初始化时也调用

// 监听睡眠状态变化，播放对应动画
watch(() => props.isSleeping, (newVal) => {
  if (newVal && model && model.motions && model.motions.sleepy) {
    playMotion('sleepy');  // 播放睡眠动画
  }
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
  /* 确保完全透明，无任何边框 */
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  background-color: transparent !important;
  /* 鼠标穿透：让鼠标事件穿透到下层窗口 */
  pointer-events: none;
}
</style>
