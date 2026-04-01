# 📁 桌面宠物项目文件框架

## 🎯 项目概述
这是一个基于 **Tauri + Vue 3 + TypeScript** 的桌面宠物应用，使用 Live2D 技术实现虚拟角色交互。

---

## 📂 完整文件结构

```
table-pet-game/
├── 📄 package.json                      # 项目配置和依赖管理
├── 📄 tsconfig.json                     # TypeScript 配置
├── 📄 vite.config.ts                    # Vite 构建工具配置
├── 📄 index.html                        # HTML 入口文件
│
├── 📁 public/                           # 静态资源目录（直接复制到输出目录）
│   ├── 📁 libs/                         # Live2D 核心库
│   │   ├── live2d.min.js               # Cubism 2.1 SDK（压缩版）
│   │   ├── live2dcubismcore.js         # Cubism 4 核心库
│   │   └── live2dcubismcore.min.js     # Cubism 4 核心库（压缩版）
│   │
│   └── 📁 models/                       # Live2D 模型资源
│       ├── 📁 histoire/                 # Histoire 角色模型
│       │   ├── 📁 histoire.1024/        # 纹理贴图目录
│       │   │   ├── texture_00.png
│       │   │   ├── texture_01.png
│       │   │   ├── texture_02.png
│       │   │   └── texture_03.png
│       │   ├── 📁 motions/              # 动作文件目录
│       │   │   ├── 📁 idle/            # 待机动作
│       │   │   │   ├── NOZOMU_M01.mtn
│       │   │   │   ├── NOZOMU_M02.mtn
│       │   │   │   └── NOZOMU_M04.mtn
│       │   │   └── 📁 tap/             # 点击动作
│       │   │       ├── DK_NOZOMU_0011.mtn
│       │   │       ├── DK_NOZOMU_0041.mtn
│       │   │       ├── ... (共 14 个动作文件)
│       │   ├── model.json              # 模型配置文件 ⭐
│       │   ├── model.moc               # 模型数据文件（二进制）
│       │   └── ico_histoire.png        # 角色图标
│       │
│       └── 📁 nep/                      # Nep 角色模型（备用）
│           ├── 📁 histoire.1024/       # 纹理贴图
│           ├── 📁 motions/             # 动作文件
│           ├── model.json              # 模型配置
│           ├── model.moc               # 模型数据
│           └── ico_histoire.png
│
├── 📁 src/                              # 源代码目录
│   ├── 📄 main.ts                       # Vue应用入口 ⭐
│   ├── 📄 App.vue                       # 根应用组件 ⭐
│   ├── 📄 vite-env.d.ts                # Vite 环境类型定义
│   │
│   ├── 📁 components/                   # Vue 组件目录
│   │   ├── 📄 Live2DPet.vue            # 宠物主组件 ⭐⭐⭐
│   │   │
│   │   └── 📁 Live2DPetComponents/     # 宠物子组件
│   │       ├── 📄 Live2DCanvas.vue     # Live2D 画布渲染组件 ⭐⭐
│   │       ├── 📄 Live2DMessage.vue    # 消息气泡组件 ⭐
│   │       └── 📄 ControlPanel.vue     # 控制面板组件 ⭐
│   │
│   ├── 📁 composables/                  # 可组合函数（逻辑复用）
│   │   ├── 📄 useMessageSystem.ts      # 消息系统管理 ⭐⭐
│   │   ├── 📄 useIdleDetection.ts      # 空闲/睡眠检测 ⭐⭐
│   │   └── 📄 useHitDetection.ts       # 碰撞检测 ⭐
│   │
│   └── 📁 assets/                       # 需要构建处理的资源
│       └── 📄 vue.svg                   # Vue logo
│
├── 📁 src-tauri/                        # Tauri 后端（Rust）目录
│   ├── 📄 Cargo.toml                    # Rust 依赖配置
│   ├── 📄 tauri.conf.json              # Tauri 应用配置 ⭐⭐
│   ├── 📄 build.rs                      # Rust 构建脚本
│   │
│   ├── 📁 capabilities/                 # 权限配置
│   │   └── 📄 default.json             # 默认权限
│   │
│   ├── 📁 src/                          # Rust 源代码
│   │   ├── 📄 main.rs                   # Rust 入口 ⭐
│   │   └── 📄 lib.rs                    # Tauri 应用逻辑 ⭐
│   │
│   ├── 📁 icons/                        # 应用图标
│   │   ├── icon.ico                    # Windows 图标
│   │   ├── icon.icns                   # macOS 图标
│   │   └── ... (多种尺寸 PNG)
│   │
│   └── 📁 gen/schemas/                  # Tauri 生成的 Schema
│       ├── acl-manifests.json
│       ├── capabilities.json
│       ├── desktop-schema.json
│       └── windows-schema.json
│
├── 📁 .vscode/                          # VSCode 配置
│   └── 📄 extensions.json              # 推荐插件
│
└── 📁 .lingma/                          # Lingma AI 配置
    ├── 📁 agents/
    └── 📁 skills/
```

---

## 🔑 核心文件详解

### 前端部分

#### 1️⃣ **入口文件**
- **`index.html`** - HTML 模板，引用 Live2D 库
- **`src/main.ts`** - Vue应用创建和挂载点

#### 2️⃣ **核心组件**（按重要性排序）

**🌟 Live2DPet.vue** （最重要）
```
功能：
├─ 整合所有子组件
├─ 鼠标视线跟随（核心功能）
├─ 点击区域检测
├─ 交互事件处理（mousemove, click）
├─ 状态管理（睡眠、悬停）
└─ 调用 composables

关键代码段：
├─ Line 169-315: handleMouseMove() - 视线跟随逻辑
├─ Line 330-350: handleClick() - 点击互动
└─ Line 78-99: 模型配置和参数索引
```

**🌟 Live2DCanvas.vue**
```
功能：
├─ 使用 PixiJS 渲染 Live2D 模型
├─ 模型加载和初始化
├─ 动作播放（playMotion）
├─ 模型尺寸调整
└─ 暴露方法给父组件

关键技术：
├─ PIXI.Application - WebGL 渲染器
├─ Live2DModel.from() - 模型加载
└─ cubism2 模块导入
```

**🌟 Live2DMessage.vue**
```
功能：
├─ 显示对话气泡
├─ 位置控制（上/中/下，左/中/右）
└─ 淡入淡出动画
```

**🌟 ControlPanel.vue**
```
功能：
├─ 睡眠/唤醒按钮
├─ 重置位置按钮
└─ 插槽扩展（自定义按钮）
```

#### 3️⃣ **Composable 函数**（逻辑复用）

**useMessageSystem.ts**
```typescript
功能：管理消息系统
├─ messages: 预设消息文本
│  ├─ mouseover.head: 摸头时的随机消息
│  ├─ mouseover.body: 摸身体时的随机消息
│  ├─ click.head: 点击头部的消息
│  ├─ click.body: 点击身体的消息
│  ├─ idle: 无聊时的消息
│  ├─ sleepy: 困倦的消息
│  └─ wakeUp: 醒来的消息
├─ show(): 显示指定消息
├─ showRandom(): 随机显示一条消息
└─ hide(): 隐藏消息
```

**useIdleDetection.ts**
```typescript
功能：空闲和睡眠状态检测
参数：
├─ onIdle: 空闲时回调（5 秒无操作）
├─ onSleep: 睡眠时回调（30 秒无操作）
└─ idleDelay, sleepDelay: 延迟时间

返回：
├─ isSleeping: 是否睡眠状态
├─ startIdleDetection(): 启动检测
├─ resetIdleTimer(): 重置计时器
├─ toggleSleep(): 切换睡眠
└─ wakeUp(): 唤醒
```

**useHitDetection.ts**
```typescript
功能：碰撞检测工具
方法：
├─ isInHitArea(): 检查是否在矩形区域内
└─ getNormalizedCoords(): 获取归一化坐标 (-1 ~ 1)
```

#### 4️⃣ **配置文件**

**vite.config.ts**
```typescript
关键配置：
├─ plugins: [vue()] - Vue 支持
├─ optimizeDeps: 预构建 pixi 相关依赖
├─ server.port: 1420 - Tauri 期望端口
└─ server.watch.ignored: 忽略 src-tauri 目录
```

**tsconfig.json**
```json
TypeScript 配置
├─ Vue 3 + `<script setup>` 支持
├─ 严格模式启用
└─ 路径别名配置
```

---

### 后端部分（Tauri）

#### 1️⃣ **tauri.conf.json**
```json
窗口配置：
├─ width: 358, height: 374 - 初始窗口大小
├─ transparent: true - 透明背景
├─ decorations: false - 无边框
├─ alwaysOnTop: true - 始终置顶
└─ resizable: true - 可调整大小

构建配置：
├─ beforeDevCommand: npm run dev
├─ devUrl: http://localhost:1420
└─ frontendDist: ../dist
```

#### 2️⃣ **main.rs**
```rust
功能：Rust 程序入口
作用：
├─ 防止 Windows 控制台窗口显示
└─ 调用 lib.rs 的 run() 函数
```

#### 3️⃣ **lib.rs**
```rust
功能：Tauri 应用逻辑
├─ tauri::Builder - 构建器模式
├─ tauri_plugin_opener - 打开链接插件
└─ greet 命令示例（未使用）
```

---

## 🎨 数据流图

```
用户交互
  │
  ├─> mousemove ──> handleMouseMove()
  │                 ├─ 视线跟随（修改 Live2D 参数）
  │                 ├─ 碰撞检测
  │                 └─ 透明度控制
  │
  └─> click ──> handleClick()
                ├─ 播放动作
                └─ 显示消息

空闲检测
  ├─ 5 秒无操作 ──> handleIdle() ──> 显示无聊消息
  └─ 30 秒无操作 ──> handleSleep() ──> 进入睡眠状态

模型加载流程：
Live2DCanvas.vue
  ├─ PIXI.Application 初始化
  ├─ Live2DModel.from(modelPath)
  ├─ 调整模型大小和位置
  └─ emit('model-loaded') ──> 父组件启动空闲检测
```

---

## 🔧 技术栈总结

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | Vue 3 | 3.5.13 | 响应式 UI |
| 构建工具 | Vite | 6.0.3 | 快速开发和打包 |
| 语言 | TypeScript | ~5.6.2 | 类型安全 |
| 桌面框架 | Tauri | 2.x | 原生桌面应用 |
| 渲染引擎 | PixiJS | 6.5.10 | WebGL 2D 渲染 |
| Live2D 集成 | pixi-live2d-display | 0.4.0 | Live2D 模型加载 |
| Live2D SDK | Cubism Core | 2.1 | 模型核心库 |

---

## 🚀 开发命令

```bash
# 开发模式
npm run dev          # 仅前端
npm run tauri dev    # 完整 Tauri 开发

# 构建
npm run build        # 仅前端
npm run tauri build  # 完整打包

# 预览
npm run preview
```

---

## 📝 关键知识点

### 1. **Live2D 参数系统**
- `ParamAngleX/Y/Z`: 头部转动
- `ParamEyeBallX/Y`: 眼球移动
- `ParamMouthOpenY`: 嘴巴开合
- `ParamBreath`: 呼吸效果

### 2. **坐标系统**
- **屏幕坐标**: 像素单位（clientX, clientY）
- **归一化坐标**: -1 ~ 1 范围（Live2D 坐标系）
- **转换公式**: 
  ```typescript
  x = ((clientX - rect.left) / rect.width) * 2 - 1
  y = -((clientY - rect.top) / rect.height) * 2 + 1
  ```

### 3. **pixi-live2d-display API**
```typescript
// 模型加载
const model = await Live2DModel.from('model.json')

// 参数索引（已预先获取）
model.angleXParamIndex
model.eyeballXParamIndex

// 动作播放
model.motion(motionData)
model.playMotion('flick_head')

// 内部结构
model.internalModel.coreModel  // 访问底层 SDK
```

---

## 💡 常见问题定位

### 视线跟随不工作？
1. 检查控制台是否有参数索引输出
2. 确认 `coreModel.setParamFloat` 方法存在
3. 查看模型是否支持 `ParamAngleX/Y` 参数

### 模型不显示？
1. 检查 `public/models` 路径是否正确
2. 确认 `model.json` 中的纹理路径
3. 查看 PIXI 和 Live2D 库是否正确加载

### 点击没反应？
1. 检查 `hitAreas` 坐标配置
2. 确认 `getNormalizedCoords` 计算正确
3. 验证 `isInHitArea` 逻辑

---

## 📚 学习资源

- [PixiJS 文档](https://pixijs.com/guides/)
- [Live2D Cubism SDK](https://www.live2d.com/en/download/cubism-sdk/)
- [pixi-live2d-display GitHub](https://github.com/guansss/pixi-live2d-display)
- [Tauri 官方文档](https://tauri.app/)
- [Vue 3 组合式 API](https://cn.vuejs.org/guide/extras/composition-api-faq.html)

---

**最后更新**: 2026 年 3 月 23 日  
**维护者**: 项目团队
