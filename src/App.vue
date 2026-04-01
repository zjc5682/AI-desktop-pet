<!--
  App.vue - 根应用组件
  功能：应用的入口组件，包含Live2D宠物组件
-->
<template>
  <!--
    主容器元素
    data-tauri-drag-region: 允许用户拖拽这个区域来移动窗口
  -->
  <main class="container" data-tauri-drag-region>
    <!-- Live2DPet组件：显示Live2D模型 -->
    <Live2DPet />
  </main>
</template>

<script setup lang="ts">
/*
  导入Live2DPet组件
  这个组件负责显示和控制Live2D模型
*/
import Live2DPet from './components/Live2DPet.vue';
</script>

<style>
/*
  全局样式重置和基础样式
  确保应用全屏显示，没有滚动条，完全透明
*/

/* 重置 html 和 body 元素的默认样式 */
html, body {
  margin: 0;        /* 移除默认外边距 */
  padding: 0;       /* 移除默认内边距 */
  width: 100vw;     /* 宽度为视口宽度 */
  height: 100vh;    /* 高度为视口高度 */
  background-color: transparent !important; /* 透明背景 */
  overflow: hidden; /* 隐藏滚动条 */
  border: none !important; /* 移除边框 */
  outline: none !important; /* 移除轮廓线 */
}

/* 主容器样式 */
.container {
  width: 100vw;     /* 宽度为视口宽度 */
  height: 100vh;    /* 高度为视口高度 */
  background-color: transparent !important; /* 透明背景 */
  border: none !important; /* 移除边框 */
  outline: none !important; /* 移除轮廓线 */
  box-shadow: none !important; /* 移除阴影 */
}
</style>