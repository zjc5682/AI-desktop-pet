<template>
  <div class="control-panel">
    <slot name="custom-buttons"></slot>

    <button
      v-if="showSleep"
      class="control-btn"
      :title="isSleeping ? wakeTitle : sleepTitle"
      @click="$emit('toggle-sleep')"
    >
      {{ isSleeping ? wakeLabel : sleepLabel }}
    </button>

    <button
      v-if="showReset"
      class="control-btn"
      :title="resetTitle"
      @click="$emit('reset-position')"
    >
      {{ resetLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  isSleeping: boolean;
  showSleep?: boolean;
  showReset?: boolean;
  sleepTitle?: string;
  wakeTitle?: string;
  sleepLabel?: string;
  wakeLabel?: string;
  resetTitle?: string;
  resetLabel?: string;
}

interface Emits {
  (e: 'toggle-sleep'): void;
  (e: 'reset-position'): void;
}

withDefaults(defineProps<Props>(), {
  showSleep: true,
  showReset: true,
  sleepTitle: 'Sleep mode',
  wakeTitle: 'Wake up',
  sleepLabel: 'Sleep',
  wakeLabel: 'Wake',
  resetTitle: 'Reset position',
  resetLabel: 'Reset',
});

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
  pointer-events: auto;
}

.control-panel:hover {
  opacity: 1;
}

.control-btn {
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
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
