<!--
  Live2DPet.vue - Live2D 宠物主组件
  功能：整合所有子组件和 composable 函数，实现完整的 Live2D 宠物交互功能
  
  核心功能：
  1. Live2D 模型加载和渲染
  2. 鼠标视线跟随
  3. 点击区域检测和互动
  4. 空闲/睡眠状态管理
  5. 消息气泡系统
-->
<template>
  <!-- 宠物容器 -->
  <div ref="containerRef" class="pet-container" :style="containerStyle">
    <!-- Live2D 画布组件：负责渲染模型 -->
    <Live2DCanvas
      ref="canvasRef"
      :model-path="currentModel.path"
      :width="canvasWidth"
      :height="canvasHeight"
      :is-sleeping="isSleeping"
      @model-loaded="handleModelLoaded"
      @motion-played="handleMotionPlayed"
    />
    
    <!-- 消息提示框组件：显示对话气泡 -->
    <Live2DMessage
      :show="messageState.showMessage.value"
      :text="messageState.messageText.value"
      vertical="top"
      horizontal="center"
    />
    
    <!-- 控制面板组件：睡眠/重置按钮 -->
    <ControlPanel
      :is-sleeping="isSleeping"
      @toggle-sleep="handleToggleSleep"
      @reset-position="handleResetPosition"
      @open-settings="openSettingsWindow"
    >
      <!-- 预留自定义按钮插槽 -->
      <template #custom-buttons>
        <button class="control-btn" @click="openSettingsWindow" title="设置">⚙️</button>
      </template>
    </ControlPanel>
  </div>
</template>

<script setup lang="ts">
/**
 * ========================================
 * 导入依赖
 * ========================================
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webview';
import Live2DCanvas from './Live2DPetComponents/Live2DCanvas.vue';
import Live2DMessage from './Live2DPetComponents/Live2DMessage.vue';
import ControlPanel from './Live2DPetComponents/ControlPanel.vue';
import { useIdleDetection } from '../composables/useIdleDetection';
import { useMessageSystem } from '../composables/useMessageSystem';
import { useHitDetection } from '../composables/useHitDetection';

/**
 * ========================================
 * 常量定义
 * ========================================
 */
// 最小画布尺寸（保证模型完整显示的最小尺寸）
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;

// 基础画布尺寸（像素）
const BASE_WIDTH = 358;
const BASE_HEIGHT = 374;

/**
 * ========================================
 * 模型配置接口和数据
 * ========================================
 */
interface ModelConfig {
  name: string;           // 模型名称
  path: string;           // model.json 路径
  hitAreas: {             // 点击区域配置
    head: { x: number[]; y: number[] };  // 头部命中区域坐标
    body: { x: number[]; y: number[] };  // 身体命中区域坐标
  };
}

// 模型列表（目前只有 histoire）
const models: ModelConfig[] = [
  {
    name: 'histoire',
    path: '/models/histoire/model.json',
    hitAreas: {
      head: { x: [-0.8, 0.8], y: [0.3, -0.5] },  // 头部矩形区域
      body: { x: [-0.6, 0.6], y: [0.8, -0.2] }   // 身体矩形区域
    }
  }
];

// 当前使用的模型
const currentModel = ref(models[0]);
// Canvas 组件引用
const canvasRef = ref<InstanceType<typeof Live2DCanvas> | null>(null);

/**
 * ========================================
 * Composable 函数初始化
 * ========================================
 */
const messageState = useMessageSystem();  // 消息系统
const { isInHitArea, getNormalizedCoords } = useHitDetection();  // 碰撞检测

/**
 * ========================================
 * 鼠标悬停状态管理
 * ========================================
 * 注意：已移除隐身功能（原功能：鼠标悬停时变透明）
 */
let hideTimer: number | null = null;  // 延迟隐藏定时器（已不再使用）

// 容器样式（固定不透明度，不再随鼠标悬停变化）
const containerStyle = computed(() => ({
  opacity: 1,  // 始终完全不透明
  transition: 'opacity 0.2s ease'  // 保留过渡效果以备将来使用
}));

// 空闲检测
const handleIdle = () => {
  messageState.showRandom(messageState.messages.idle);
};

const handleSleep = () => {
  messageState.showRandom(messageState.messages.sleepy);
};

const { isSleeping, startIdleDetection, resetIdleTimer, toggleSleep } = useIdleDetection(
  handleIdle,
  handleSleep
);

let model: any = null;
let unlistenTauri: (() => void) | null = null;

/**
 * ========================================
 * Tauri 窗口设置
 * ========================================
 * 功能：设置窗口始终置顶、监听窗口大小变化
 */
const setupTauriWindow = async () => {
  const isTauriApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  
  if (isTauriApp) {
    try {
      const tauriWindow = getCurrentWindow();
      await tauriWindow.setAlwaysOnTop(true);  // 设置窗口置顶
      
      // 监听窗口大小变化事件
      unlistenTauri = await tauriWindow.onResized(() => {
        // 窗口大小变化处理（目前为空）
      });
    } catch (error) {
      console.warn('Tauri 窗口设置失败:', error);
    }
  }
};

/**
 * ========================================
 * 事件处理函数
 * ========================================
 */

/**
 * 模型加载完成回调
 * @param loadedModel - 加载完成的 Live2D 模型实例
 */
const handleModelLoaded = (loadedModel: any) => {
  model = loadedModel;
  console.log('✅ 主组件：模型已加载');
  startIdleDetection();  // 启动空闲检测
};

/**
 * 动作播放完成回调
 * @param motionType - 播放的动作类型（如 'idle', 'tap_body' 等）
 */
const handleMotionPlayed = (motionType: string) => {
  console.log(`🎭 播放动作：${motionType}`);
};

/**
 * 切换睡眠状态
 */
const handleToggleSleep = () => {
  toggleSleep();
  if (!isSleeping.value) {
    messageState.showRandom(messageState.messages.wakeUp);  // 唤醒消息
  }
};

/**
 * 重置位置
 */
const handleResetPosition = () => {
  messageState.show('位置已重置~');
  resetIdleTimer();  // 重置空闲计时器
};

/**
 * 打开设置窗口
 */
const openSettingsWindow = async () => {
  try {
    const settingsWindow = new WebviewWindow('settings', {
      url: '/settings.html',
      title: '桌面宠物设置',
      width: 400,
      height: 450,
      resizable: false,
      center: true,
    });
    
    settingsWindow.once('tauri://created', () => {
      console.log('设置窗口已打开');
    });
    
    settingsWindow.once('tauri://error', (e) => {
      console.error('打开设置窗口失败:', e);
    });
  } catch (error) {
    console.error('打开设置窗口失败:', error);
  }
};

/**
 * ========================================
 * 鼠标移动处理（核心功能）
 * ========================================
 * 功能：
 * 1. 视线跟随鼠标移动
 * 2. 检测是否在角色区域内
 * 3. 触发随机对话
 * 4. 控制容器透明度
 */
const handleMouseMove = (e: MouseEvent) => {
  if (!model || !canvasRef.value?.canvas) return;
  
  // 获取画布上的归一化坐标 (-1 ~ 1)
  const rect = canvasRef.value.canvas.getBoundingClientRect();
  const { x, y } = getNormalizedCoords(e.clientX, e.clientY, rect);
  
  /**
   * ========================================
   * 🎯 视线跟随功能
   * ========================================
   * 原理：将鼠标位置转换为 Live2D 参数值
   * 参数说明：
   * - ParamAngleX/Y: 头部转动角度
   * - ParamEyeBallX/Y: 眼球移动
   */
  try {
    // 使用 model.model 访问底层 Live2D 模型
    const live2dModel = model.model || model.internalModel || model._model;
    
    if (live2dModel) {
      // 将鼠标位置转换为 Live2D 坐标系的眼睛角度 (-1 ~ 1)
      // 使用屏幕中心作为参考点，而不是画布中心
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;
      
      // 计算鼠标相对于屏幕中心的偏移 (-1 ~ 1)
      const eyeX = ((e.clientX - screenCenterX) / screenCenterX) * 0.8;
      const eyeY = -((e.clientY - screenCenterY) / screenCenterY) * 0.8;
      
      // 🔍 首先检测并输出所有可用的方法和参数
      const windowWithDebug = window as typeof window & { live2dDebugged?: boolean };
      
      if (!windowWithDebug.live2dDebugged) {
        windowWithDebug.live2dDebugged = true;
        console.log('🔍 ========== Live2D 模型调试信息 ==========');
        console.log('live2dModel 类型:', typeof live2dModel);
        console.log('live2dModel 构造函数:', live2dModel.constructor?.name);
        console.log('live2dModel 所有属性:', Object.keys(live2dModel));
        
        // 检查 coreModel
        const coreModel = live2dModel.coreModel || live2dModel._coreModel || live2dModel.internalCore;
        if (coreModel) {
          console.log('✅ 找到 coreModel');
          console.log('coreModel 类型:', typeof coreModel);
          console.log('coreModel 构造函数:', coreModel.constructor?.name);
          console.log('coreModel 所有属性:', Object.keys(coreModel));
          
          // 尝试获取所有参数 ID
          if (typeof coreModel.getParameterIds === 'function') {
            try {
              const paramIds = coreModel.getParameterIds();
              console.log('📋 所有可用参数 IDs:', paramIds);
              
              // 查找眼睛相关的参数
              const eyeParams = paramIds.filter((id: string) => 
                id.toLowerCase().includes('eye') || 
                id.toLowerCase().includes('angle') ||
                id.toLowerCase().includes('ball')
              );
              console.log('👁️ 眼睛相关参数:', eyeParams);
            } catch (err) {
              console.warn('❌ 无法获取参数 IDs:', err);
            }
          }
          
          // 检查所有可能的方法
          const possibleMethods = [
            'setParameterValueById', 'setParam', 'addParameterValue', 
            'setParameterValue', 'setValue', 'updateParameter',
            'setParamValue', 'param', 'setParameter', 'loadModel', 'reload'
          ];
          
          console.log('🔧 检查 coreModel 方法:');
          for (const method of possibleMethods) {
            const hasMethod = typeof (coreModel as any)[method] === 'function';
            console.log(`${hasMethod ? '✅' : '❌'} ${method}`);
          }
        } else {
          console.log('❌ 未找到 coreModel');
        }
        
        // 检查 live2dModel 自身的方法
        console.log('🔧 检查 live2dModel 方法:');
        const live2dMethods = [
          'setParameterValueById', 'setParam', 'addParameterValue', 
          'setParameterValue', 'setValue', 'updateParameter',
          'setParamValue', 'param', 'setParameter', 'motion', 'startMotion', 'express'
        ];
        for (const method of live2dMethods) {
          const hasMethod = typeof (live2dModel as any)[method] === 'function';
          console.log(`${hasMethod ? '✅' : '❌'} ${method}`);
        }
        
        console.log('===========================================\n');
      }
      
      // 🔍 pixi-live2d-display 特殊处理
      // 发现 live2dModel 已经有参数索引，应该可以直接使用
      console.log('👁️ 眼睛参数索引:', {
        eyeballX: (live2dModel as any).eyeballXParamIndex,
        eyeballY: (live2dModel as any).eyeballYParamIndex,
        angleX: (live2dModel as any).angleXParamIndex,
        angleY: (live2dModel as any).angleYParamIndex
      });
      
      // 检查是否有 setParamFloat 或类似方法
      const internalModel = (live2dModel as any).internalModel || (live2dModel as any)._model;
      
      if (internalModel) {
        console.log('🔍 找到 internalModel');
        
        // 从 internalModel 获取 coreModel
        const coreModel = internalModel.coreModel || internalModel._coreModel;
        
        if (coreModel) {
          console.log('✅ 通过 internalModel 找到 coreModel');
          
          // 🔍 列出 coreModel 的所有属性和方法
          const allProps = Object.getOwnPropertyNames(coreModel);
          console.log('📋 coreModel 所有属性:', allProps);
          
          const allMethods = allProps.filter(p => typeof (coreModel as any)[p] === 'function');
          console.log('🔧 coreModel 所有方法:', allMethods);
          
          // 查找可能的方法名
          const possibleParamMethods = allMethods.filter(m => 
            m.toLowerCase().includes('param') || 
            m.toLowerCase().includes('set') ||
            m.toLowerCase().includes('value') ||
            m.length <= 3 // 压缩后的短方法名
          );
          console.log('💡 可能的参数相关方法:', possibleParamMethods);
          
          // 尝试使用参数索引直接设置（如果找到正确方法）
          const angleXIdx = (live2dModel as any).angleXParamIndex;
          const angleYIdx = (live2dModel as any).angleYParamIndex;
          const eyeballXIdx = (live2dModel as any).eyeballXParamIndex;
          const eyeballYIdx = (live2dModel as any).eyeballYParamIndex;
          
          if (angleXIdx !== undefined && typeof coreModel.setParamFloat === 'function') {
            console.log('✅ 使用 coreModel.setParamFloat + 参数索引');
            coreModel.setParamFloat(angleXIdx, eyeX);
            coreModel.setParamFloat(angleYIdx, eyeY);
            coreModel.setParamFloat(eyeballXIdx, eyeX * 0.8);
            coreModel.setParamFloat(eyeballYIdx, eyeY * 0.8);
            return;
          }
          
          // 检查是否有 setParameterValueById 方法
          if (typeof coreModel.setParameterValueById === 'function') {
            console.log('✅ 使用 coreModel.setParameterValueById');
            coreModel.setParameterValueById('ParamAngleX', eyeX);
            coreModel.setParameterValueById('ParamAngleY', eyeY);
            coreModel.setParameterValueById('ParamEyeBallX', eyeX * 0.8);
            coreModel.setParameterValueById('ParamEyeBallY', eyeY * 0.8);
            return; // 成功后直接返回
          } else {
            console.warn('❌ coreModel.setParameterValueById 不是函数');
            
            // 🆘 尝试调用找到的第一个参数相关方法
            if (possibleParamMethods.length > 0) {
              const methodToTry = possibleParamMethods[0];
              console.log('🔍 尝试使用方法:', methodToTry);
              try {
                (coreModel as any)[methodToTry]('ParamAngleX', eyeX);
                console.log(`✅ 使用 ${methodToTry} 成功!`);
              } catch (err) {
                console.warn(`❌ ${methodToTry} 失败:`, err);
              }
            }
          }
        } else {
          console.warn('❌ 无法从 internalModel 获取 coreModel');
        }
      }
      
      // 备用方案：直接从 live2dModel 获取 coreModel
      const coreModelDirect = live2dModel.coreModel || live2dModel._coreModel || live2dModel.internalCore;
      
      if (coreModelDirect && typeof coreModelDirect.setParameterValueById === 'function') {
        console.log('✅ 使用 live2dModel.coreModel.setParameterValueById');
        coreModelDirect.setParameterValueById('ParamAngleX', eyeX);
        coreModelDirect.setParameterValueById('ParamAngleY', eyeY);
        coreModelDirect.setParameterValueById('ParamEyeBallX', eyeX * 0.8);
        coreModelDirect.setParameterValueById('ParamEyeBallY', eyeY * 0.8);
        return;
      }
    }
  } catch (error) {
    // 如果视线跟随失败，不影响其他功能
    console.error('❌ 视线跟随设置失败:', error);
  }
  
  /**
   * ========================================
   * 🖱️ 点击区域检测
   * ========================================
   * 检测鼠标是否在头部或身体的命中区域内
   */
  const headHit = isInHitArea(x, y, currentModel.value.hitAreas.head);
  const bodyHit = isInHitArea(x, y, currentModel.value.hitAreas.body);
  
  // 检测是否在角色区域内
  const isOverPet = headHit || bodyHit;
  
  if (isOverPet) {
    // === 鼠标在角色上 ===
    // 已移除隐身逻辑：不再设置 isMouseOver 和透明度变化
    
    // 清除之前的定时器（虽然已经不再使用，但保留清理逻辑）
    if (hideTimer) clearTimeout(hideTimer);
    
    canvasRef.value.canvas.style.cursor = 'pointer';  // 改变鼠标样式
    
    // 随机显示对话（2% 概率）
    if (Math.random() < 0.02) {
      if (headHit) {
        messageState.showRandom(messageState.messages.mouseover.head);
      } else if (bodyHit) {
        messageState.showRandom(messageState.messages.mouseover.body);
      }
    }
  } else {
    // === 鼠标离开角色区域 ===
    // 已移除恢复透明度逻辑
    
    canvasRef.value.canvas.style.cursor = 'default';  // 默认鼠标样式
  }
  
  resetIdleTimer();  // 重置空闲计时器（有交互就不算 idle）
};

/**
 * ========================================
 * 点击事件处理
 * ========================================
 * 功能：根据点击区域播放对应动作和消息
 */
const handleClick = (e: MouseEvent) => {
  if (!model || isSleeping.value || !canvasRef.value?.canvas) return;
  
  const rect = canvasRef.value.canvas.getBoundingClientRect();
  const { x, y } = getNormalizedCoords(e.clientX, e.clientY, rect);
  
  // 根据命中区域播放不同动作
  if (isInHitArea(x, y, currentModel.value.hitAreas.head)) {
    canvasRef.value.playMotion('flick_head');  // 摸头动作
    canvasRef.value.playMotion('happy'); 
    messageState.showRandom(messageState.messages.click.head);
  } else if (isInHitArea(x, y, currentModel.value.hitAreas.body)) {
    canvasRef.value.playMotion('tap_body');  // 拍身体动作
    messageState.showRandom(messageState.messages.click.body);
  }
  
  resetIdleTimer();  // 重置空闲计时器
};

/**
 * ========================================
 * 响应式画布尺寸计算
 * ========================================
 * 根据容器实际大小动态计算画布尺寸，确保模型完整显示
 */
const containerRef = ref<HTMLElement | null>(null);
const canvasWidth = ref(BASE_WIDTH);
const canvasHeight = ref(BASE_HEIGHT);

// 监听容器尺寸变化，动态调整画布大小
const updateCanvasSize = () => {
  if (containerRef.value) {
    const containerWidth = containerRef.value.offsetWidth;
    const containerHeight = containerRef.value.offsetHeight;
    
    // 修复：确保画布完全适配容器，同时有最小尺寸保护
    // 当容器过小时，使用最小尺寸，但画布会完全显示在容器内
    canvasWidth.value = Math.max(MIN_WIDTH, containerWidth);
    canvasHeight.value = Math.max(MIN_HEIGHT, containerHeight);
    
    console.log(`📐 画布尺寸调整：容器 ${containerWidth}x${containerHeight} -> 画布 ${canvasWidth.value}x${canvasHeight.value}`);
  }
};

/**
 * ========================================
 * 生命周期钩子
 * ========================================
 */
onMounted(async () => {
  await setupTauriWindow();  // 设置 Tauri 窗口属性
  
  // 初始化画布尺寸
  updateCanvasSize();
  
  // 监听窗口大小变化（使用 ResizeObserver）
  const resizeObserver = new ResizeObserver(() => {
    updateCanvasSize();
  });
  
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
  
  // 添加全局事件监听
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('click', handleClick);
});

onUnmounted(() => {
  /**
   * ========================================
   * 组件卸载时的清理工作
   * ========================================
   * 目的：防止内存泄漏和无效的事件触发
   */
  
  // 1. 移除全局鼠标事件监听器
  // 原因：这些监听器是在 window 对象上注册的，组件销毁后如果不移除，
  //      回调函数会继续保持引用，导致内存泄漏
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('click', handleClick);
  
  // 2. 清理 Tauri 窗口大小变化监听器
  // 原因：Tauri 的 onResized 返回一个取消监听函数，
  //      调用它可以断开与原生窗口的连接
  if (unlistenTauri) {
    unlistenTauri();
  }
  
  // 3. 清理延迟隐藏定时器
  // 注意：虽然当前版本已移除隐身功能，但保留此清理逻辑以防将来恢复该功能
  // 原因：未清除的定时器可能在组件销毁后仍然执行，导致错误
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
  
  // 4. ResizeObserver 清理说明
  // 注意：ResizeObserver 会在目标元素从 DOM 移除时自动停止观察，
  //      因此不需要手动调用 disconnect()
  // 但如果显式清理，可以调用：resizeObserver.disconnect()
});
</script>

<style scoped>
.pet-container {
  position: relative;
  width: 100%;
  height: 100%;
  /* 修复：允许容器内容溢出，避免限制画布最小尺寸 */
  overflow: visible;
  /* 确保完全透明，无边框 */
  background-color: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  /* 鼠标穿透：让鼠标事件穿透到下层窗口 */
  pointer-events: none;
}

:deep(.control-btn) {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  font-size: 14px;
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
</style>
