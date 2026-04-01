/*
  vite.config.ts - Vite 构建工具配置文件
  功能：配置 Vite 开发服务器和构建选项，专门为 Tauri 应用优化
*/

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 获取 Tauri 开发主机环境变量（如果存在）
const host = process.env.TAURI_DEV_HOST;

/*
  导出 Vite 配置
  使用异步函数以支持动态配置
*/
export default defineConfig(async () => ({
  /*
    插件配置
    - vue(): Vue 单文件组件支持插件
  */
  plugins: [vue()],

  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        settings: './settings.html',
      },
    },
  },

  /*
    Vite 选项，专门为 Tauri 开发和构建优化
    这些选项只在`tauri dev`或`tauri build`命令时应用
  */

  // 1. 防止 Vite 清除屏幕，避免遮挡 Rust 错误信息
  clearScreen: false,

  /*
    2. 优化依赖配置 - 强制预构建 pixi 相关依赖
    解决 CommonJS 模块的导出问题
  */
  optimizeDeps: {
    include: ['pixi.js', 'pixi-live2d-display'],
  },

  /*
    3. 开发服务器配置
    - port: 固定端口 1420，Tauri 期望这个端口
    - strictPort: 如果端口不可用则失败
    - host: 主机配置，支持 Tauri 的开发主机
    - hmr: 热模块替换配置
  */
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",     // WebSocket 协议
          host,               // 主机地址
          port: 1421,         // HMR 端口
        }
      : undefined,

    /*
      4. 文件监听配置
      忽略 src-tauri 目录，避免不必要的重新构建
    */
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));