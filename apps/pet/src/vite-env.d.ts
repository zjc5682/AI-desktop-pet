/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'pixi-live2d-display' {
  import * as PIXI from 'pixi.js';
  export class Live2DModel extends PIXI.Container {
    static from(path: string): Promise<Live2DModel>;
    motion(motion: any): void;
    get motions(): Record<string, any[]>;
    get model(): any;
    autoUpdate: boolean;
  }
}
