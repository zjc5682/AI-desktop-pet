<template>
  <div class="settings-container">
    <h2>⚙️ 桌面宠物设置</h2>
    
    <div class="settings-section">
      <h3>🎭 模型选择</h3>
      <select v-model="selectedModel" class="setting-select">
        <option v-for="model in availableModels" :key="model.name" :value="model.name">
          {{ model.name }}
        </option>
      </select>
    </div>
    
    <div class="settings-section">
      <h3>🪟 窗口设置</h3>
      <label class="setting-row">
        <span>窗口置顶</span>
        <input type="checkbox" v-model="alwaysOnTop" @change="updateAlwaysOnTop">
      </label>
    </div>
    
    <div class="settings-section">
      <h3>💬 消息设置</h3>
      <label class="setting-row">
        <span>显示消息</span>
        <input type="checkbox" v-model="showMessages">
      </label>
    </div>
    
    <div class="settings-section">
      <h3>😴 空闲设置</h3>
      <label class="setting-row">
        <span>空闲检测</span>
        <input type="checkbox" v-model="idleDetection">
      </label>
      <label class="setting-row">
        <span>空闲时间（秒）</span>
        <input type="number" v-model.number="idleTime" min="5" max="300" class="setting-input">
      </label>
    </div>
    
    <button class="save-btn" @click="saveSettings">保存设置</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';

interface ModelConfig {
  name: string;
  path: string;
}

const availableModels: ModelConfig[] = [
  { name: 'histoire', path: '/models/histoire/model.json' },
];

const selectedModel = ref(localStorage.getItem('selectedModel') || 'histoire');
const alwaysOnTop = ref(true);
const showMessages = ref(true);
const idleDetection = ref(true);
const idleTime = ref(30);

onMounted(() => {
  const savedSettings = localStorage.getItem('petSettings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    selectedModel.value = settings.selectedModel || 'histoire';
    alwaysOnTop.value = settings.alwaysOnTop ?? true;
    showMessages.value = settings.showMessages ?? true;
    idleDetection.value = settings.idleDetection ?? true;
    idleTime.value = settings.idleTime || 30;
  }
});

const updateAlwaysOnTop = async () => {
  try {
    const tauriWindow = getCurrentWindow();
    await tauriWindow.setAlwaysOnTop(alwaysOnTop.value);
  } catch (error) {
    console.error('设置窗口置顶失败:', error);
  }
};

const saveSettings = async () => {
  const settings = {
    selectedModel: selectedModel.value,
    alwaysOnTop: alwaysOnTop.value,
    showMessages: showMessages.value,
    idleDetection: idleDetection.value,
    idleTime: idleTime.value,
  };
  
  localStorage.setItem('petSettings', JSON.stringify(settings));
  
  await emit('settings-changed', settings);
  
  const currentWindow = getCurrentWindow();
  await currentWindow.close();
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
}

.settings-container {
  padding: 24px;
  max-width: 400px;
  margin: 0 auto;
}

h2 {
  text-align: center;
  margin-bottom: 24px;
  color: #333;
}

h3 {
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.settings-section {
  background: white;
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 16px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.setting-row span {
  color: #333;
}

.setting-select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.setting-input {
  width: 80px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.save-btn {
  width: 100%;
  padding: 14px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.save-btn:hover {
  background: #45a049;
}
</style>
