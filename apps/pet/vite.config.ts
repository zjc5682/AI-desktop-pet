import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@table-pet/character": resolve(__dirname, "../../packages/character/src"),
      "@table-pet/core": resolve(__dirname, "../../packages/core/src"),
      "@table-pet/live2d": resolve(__dirname, "../../packages/live2d/src"),
      "@table-pet/memory": resolve(__dirname, "../../packages/memory/src"),
      "@table-pet/perception": resolve(__dirname, "../../packages/perception/src"),
      "@table-pet/plugins": resolve(__dirname, "../../packages/plugins/src"),
      "@table-pet/policy": resolve(__dirname, "../../packages/policy/src"),
      "@table-pet/providers": resolve(__dirname, "../../packages/providers/src"),
      "@table-pet/realtime": resolve(__dirname, "../../packages/realtime/src"),
      "@table-pet/ai-core": resolve(__dirname, "../../packages/ai-core/src"),
      "@table-pet/shared": resolve(__dirname, "../../packages/shared/src"),
      "@table-pet/stage": resolve(__dirname, "../../packages/stage/src"),
    },
  },
  publicDir: resolve(__dirname, "../../public"),
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        chat: resolve(__dirname, 'chat.html'),
        settings: resolve(__dirname, 'settings.html'),
        call: resolve(__dirname, 'call.html'),
        proactive: resolve(__dirname, 'proactive.html'),
        'translate-overlay': resolve(__dirname, 'translate-overlay.html'),
        'capture-selector': resolve(__dirname, 'capture-selector.html'),
      },
    },
  },
  clearScreen: false,
  optimizeDeps: {
    include: ['pixi.js'],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
