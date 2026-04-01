/*
  vite-env.d.ts - Vite环境类型定义文件
  功能：为Vite开发环境提供TypeScript类型声明
*/

// 引用Vite客户端类型定义
/// <reference types="vite/client" />

/*
  Window 接口扩展
  为 Live2D 集成添加 PIXI.js 全局类型声明
*/
declare global {
  interface Window {
    PIXI: typeof import('pixi.js');
    live2dDebugged?: boolean; // Live2D 调试标志
  }
}

/*
  Vue模块声明
  告诉TypeScript如何处理.vue文件
*/
declare module "*.vue" {
  /*
    导入Vue的DefineComponent类型
    用于定义Vue组件的类型
  */
  import type { DefineComponent } from "vue";

  /*
    定义Vue组件类型
    所有.vue文件都被视为DefineComponent类型
  */
  const component: DefineComponent<{}, {}, any>;

  /*
    导出默认组件
    允许从.vue文件进行默认导入
  */
  export default component;
}
