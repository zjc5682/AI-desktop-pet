<!--
  ControlPanel.vue - 控制面板组件
  功能：提供用户交互按钮（睡眠/唤醒、重置位置）
  
  特性：
  1. 可插拔设计，支持自定义按钮（通过 slot）
  2. 鼠标悬停时显示，平时半透明（opacity: 0.3 → 1）
  3. 简洁的图标按钮设计（Emoji 图标）
  4. 平滑的过渡动画和缩放效果
-->
<template>
  <div class="control-panel">
    <slot name="custom-buttons"></slot>
    
    <button 
      v-if="showSleep" 
      @click="$emit('toggle-sleep')" 
      class="control-btn" 
      :title="isSleeping ? '唤醒' : '睡眠模式'"
    >
      {{ isSleeping ? '☀️' : '💤' }}
    </button>
    
    <button 
      v-if="showReset" 
      @click="$emit('reset-position')" 
      class="control-btn" 
      title="重置位置"
    >
      🏠
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * ========================================
 * Props 和 Emits 定义
 * ========================================
 */
interface Props {
  isSleeping: boolean;     // 当前是否处于睡眠状态
  showSleep?: boolean;     // 是否显示睡眠按钮（默认 true）
  showReset?: boolean;     // 是否显示重置按钮（默认 true）
}

interface Emits {
  (e: 'toggle-sleep'): void;    // 切换睡眠状态事件
  (e: 'reset-position'): void;  // 重置位置事件
}

// 使用 withDefaults 设置默认值
withDefaults(defineProps<Props>(), {
  showSleep: true,  // 默认显示睡眠按钮
  showReset: true   // 默认显示重置按钮
});

// 定义事件发射器
defineEmits<Emits>();
</script>

<style scoped>
.control-panel {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 10001;
  opacity: 0.3;
  transition: opacity 0.3s;
}

.control-panel:hover {
  opacity: 1;
}

.control-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.control-btn:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
}

.control-btn:active {
  transform: scale(0.95);
}
</style>
