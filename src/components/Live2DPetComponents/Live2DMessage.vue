<!--
  Live2DMessage.vue - 消息提示框组件
  功能：显示对话气泡和提示信息
  
  特性：
  1. 支持自定义垂直和水平位置（top/bottom/middle + center/left/right）
  2. 淡入淡出动画效果（CSS keyframes）
  3. 自动定时隐藏（由父组件控制）
  4. 半透明背景，圆角样式，阴影效果
  5. pointer-events: none 确保不阻挡鼠标事件
-->
<template>
  <div v-if="show" class="message-box" :style="messageStyle">
    {{ text }}
  </div>
</template>

<script setup lang="ts">
/**
 * ========================================
 * 导入依赖
 * ========================================
 */
import { computed } from 'vue';  // Vue 响应式计算属性

/**
 * ========================================
 * Props 定义
 * ========================================
 */
interface Props {
  show: boolean;              // 是否显示消息框（v-if 条件）
  text: string;               // 消息文本内容
  vertical?: 'top' | 'bottom' | 'middle';   // 垂直位置：顶部/底部/中间
  horizontal?: 'center' | 'left' | 'right'; // 水平位置：居中/左侧/右侧
}

// 使用 withDefaults 设置默认值
const props = withDefaults(defineProps<Props>(), {
  vertical: 'top',       // 默认顶部显示
  horizontal: 'center'   // 默认居中显示
});

/**
 * ========================================
 * 计算属性：动态样式
 * ========================================
 * 根据 Props 计算消息框的位置
 * 使用 CSS transform 实现精确居中对齐
 */
const messageStyle = computed(() => {
  const style: any = {};
  
  // === 垂直位置计算 ===
  if (props.vertical === 'top') {
    style.top = '15%';    // 顶部位置（距离顶部 15%）
  } else if (props.vertical === 'bottom') {
    style.top = '85%';    // 底部位置（距离顶部 85%）
  } else {
    style.top = '50%';    // 中间位置
  }
  
  // === 水平位置计算 ===
  if (props.horizontal === 'center') {
    style.left = '50%';
    style.transform = 'translateX(-50%)';  // 居中对齐（向左偏移自身宽度的 50%）
  } else if (props.horizontal === 'left') {
    style.left = '5%';
    style.transform = 'none';  // 左对齐（距离左边 5%）
  } else {
    style.left = '95%';
    style.transform = 'translateX(-100%)';  // 右对齐（右边缘对齐 95% 位置）
  }
  
  return style;
});
</script>

<style scoped>
.message-box {
  position: absolute;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 20px;
  border-radius: 20px;
  font-size: 14px;
  color: #333;
  white-space: nowrap;
  z-index: 10000;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: fadeInOut 3s ease-in-out;
}

@keyframes fadeInOut {
  0%, 100% { opacity: 0; transform: translateY(-10px); }
  10%, 90% { opacity: 1; transform: translateY(0); }
}
</style>
