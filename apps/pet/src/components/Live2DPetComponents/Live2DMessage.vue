<template>
  <Transition name="fade">
    <div
      v-if="show"
      class="live2d-message"
      :class="[vertical, horizontal]"
    >
      {{ text }}
    </div>
  </Transition>
</template>

<script setup lang="ts">
interface Props {
  show: boolean;
  text: string;
  vertical?: 'top' | 'bottom' | 'center';
  horizontal?: 'left' | 'right' | 'center';
}

withDefaults(defineProps<Props>(), {
  vertical: 'top',
  horizontal: 'center'
});
</script>

<style scoped>
.live2d-message {
  position: absolute;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  color: #333;
  z-index: 10000;
  pointer-events: none;
  white-space: nowrap;
}

.live2d-message.top {
  top: 10px;
}

.live2d-message.bottom {
  bottom: 40px;
}

.live2d-message.center {
  left: 50%;
  transform: translateX(-50%);
}

.live2d-message.left {
  left: 10px;
}

.live2d-message.right {
  right: 10px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
