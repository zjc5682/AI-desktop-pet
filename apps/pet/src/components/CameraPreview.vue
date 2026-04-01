<template>
  <div :class="['camera-preview', positionClass]">
    <div class="camera-preview-frame">
      <video ref="videoRef" class="camera-preview-video" :class="{ mirrored: mirror }" muted playsinline />
      <div v-if="label" class="camera-preview-label">{{ label }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

interface Props {
  stream: MediaStream | null;
  label?: string;
  mirror?: boolean;
  position?: string;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  mirror: true,
  position: 'bottom-left',
});

const videoRef = ref<HTMLVideoElement | null>(null);

const positionClass = computed(
  () =>
    ({
      'bottom-left': 'is-bottom-left',
      'bottom-right': 'is-bottom-right',
      'top-left': 'is-top-left',
      'top-right': 'is-top-right',
    })[props.position] ?? 'is-bottom-left',
);

function bindStream() {
  if (!videoRef.value) {
    return;
  }

  videoRef.value.srcObject = props.stream;
  if (props.stream) {
    void videoRef.value.play().catch(() => {});
  }
}

watch(
  () => props.stream,
  () => {
    bindStream();
  },
);

onMounted(() => {
  bindStream();
});
</script>

<style scoped>
.camera-preview {
  position: absolute;
  z-index: 10020;
  pointer-events: auto;
}

.camera-preview.is-bottom-left {
  left: 12px;
  bottom: 12px;
}

.camera-preview.is-bottom-right {
  right: 12px;
  bottom: 12px;
}

.camera-preview.is-top-left {
  left: 12px;
  top: 12px;
}

.camera-preview.is-top-right {
  right: 12px;
  top: 12px;
}

.camera-preview-frame {
  width: 180px;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(12, 18, 28, 0.88);
  box-shadow: 0 14px 34px rgba(9, 14, 24, 0.28);
  backdrop-filter: blur(12px);
}

.camera-preview-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: linear-gradient(135deg, #0c1320 0%, #1e3048 100%);
}

.camera-preview-video.mirrored {
  transform: scaleX(-1);
}

.camera-preview-label {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(9, 14, 24, 0.72);
  color: #f6f7fb;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
