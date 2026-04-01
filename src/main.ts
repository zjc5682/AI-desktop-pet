/*
  main.ts - Vue应用入口文件
  功能：创建和挂载Vue应用实例
*/

/*
  导入Vue的createApp函数
  用于创建Vue应用实例
*/
import { createApp } from "vue";

/*
  导入根组件App.vue
  这个组件包含了整个应用的主要结构
*/
import App from "./App.vue";

/*
  创建Vue应用实例并挂载到DOM元素
  - createApp(App): 使用App组件创建应用实例
  - mount("#app"): 将应用挂载到id为"app"的DOM元素上
  这个DOM元素在index.html中定义
*/
createApp(App).mount("#app");
