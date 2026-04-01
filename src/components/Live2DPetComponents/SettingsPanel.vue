<template>
  <div class="settings-panel">
    <div class="settings-header">
      <h3>⚙️ 设置</h3>
      <button class="close-btn" @click="$emit('close')">✕</button>
    </div>
    
    <div class="settings-content">
      <div class="setting-item">
        <label>🎭 当前模型</label>
        <select v-model="selectedModel" class="model-select">
          <option v-for="model in availableModels" :key="model.name" :value="model.name">
            {{ model.name }}
          </option>
        </select>
      </div>
      
      <div class="setting-item">
        <label>窗口置顶</label>
        <label class="switch">
          <input type="checkbox" v-model="alwaysOnTop" @change="handleAlwaysOnTopChange">
          <span class="slider"></span>
        </label>
      </div>
      
      <button class="apply-btn" @click="applyModel">应用设置</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface ModelConfig {
  name: string;
  path: string;
}

interface Props {
  models: ModelConfig[];
  currentModelName: string;
}

interface Emits {
  (e: 'close'): void;
  (e: 'model-change', modelName: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedModel = ref(props.currentModelName);
const alwaysOnTop = ref(true);

const availableModels = computed(() => props.models);

const applyModel = () => {
  emit('model-change', selectedModel.value);
  emit('close');
};

const handleAlwaysOnTopChange = async () => {
  try {
    const tauriWindow = getCurrentWindow();
    await tauriWindow.setAlwaysOnTop(alwaysOnTop.value);
  } catch (error) {
    console.error('设置窗口置顶失败:', error);
  }
};
</script>

<style scoped>
.settings-panel {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 160px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  z-index: 10002;
  display: flex;
  flex-direction: column;
  padding: 12px;
  box-sizing: border-box;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.settings-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: #f0f0f0;
  cursor: pointer;
  font-size: 12px;
}

.close-btn:hover {
  background: #e0e0e0;
}

.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-item label {
  font-size: 13px;
  color: #666;
}

.model-select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  background: white;
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #4CAF50;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.apply-btn {
  margin-top: auto;
  padding: 10px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.apply-btn:hover {
  background: #45a049;
}
</style>
