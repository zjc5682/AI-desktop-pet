<template>
  <main class="container" data-tauri-drag-region>
    <Live2DPet />
  </main>
</template>

<script setup lang="ts">
import Live2DPet from "./components/Live2DPet.vue";
</script>

<style>
html, body {
  background-color: transparent !important;
  overflow: hidden;
  border: none !important;
  outline: none !important;
  margin: 0;
  padding: 0;
}

.container {
  width: 100vw;
  height: 100vh;
  background-color: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
</style>
