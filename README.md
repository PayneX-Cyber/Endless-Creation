# Endless Creation

Endless Creation v0.1 的定位是一个 **Electron + React + TypeScript 原生桌面端 AI 创作平台框架版**。当前阶段优先收敛桌面壳、renderer 架构、组件/服务分层和 mock adapter 边界，为后续接入真实 AI 能力、项目库和多模态创作工作流预留扩展点；暂不扩展业务功能。

## 技术栈

- **Electron**：原生桌面窗口、IPC、preload 安全桥接。
- **React**：renderer 侧 UI 与交互。
- **TypeScript**：主进程、preload、renderer 统一类型约束。
- **Vite**：renderer 开发服务器与生产构建。
- **CSS Variables**：主题、布局、组件样式 token。

## 开发命令

> 首次拉取后先安装依赖：`npm install` 或按团队约定使用 `npm ci`。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动纯 renderer Vite 开发环境，适合调试 React UI、样式和浏览器 fallback。 |
| `npm run dev:electron` | 同时启动 Vite renderer 与 Electron 桌面窗口，适合验证 preload bridge、窗口控制和桌面体验。 |
| `npm run build` | 执行 renderer 构建与 Electron TypeScript 构建，作为交付前的完整构建检查。 |
| `npm run check` | 约定的静态检查入口，用于后续统一 typecheck/lint/test；如果当前 `package.json` 尚未配置该脚本，请先以 `npm run build` 作为 v0.1 的构建级检查。 |

当前 `npm run build` 包含：

1. `npm run build:renderer`：`tsc -b && vite build`
2. `npm run build:electron`：`tsc -p electron/tsconfig.json`

## 目录结构

```text
.
├── electron/
│   ├── main/
│   │   └── index.ts              # Electron 主进程：窗口创建、生命周期、IPC handler
│   ├── preload/
│   │   ├── bridgeTypes.ts        # preload 暴露给 renderer 的桥接类型
│   │   └── index.ts              # contextBridge 安全暴露 Electron 能力
│   └── tsconfig.json             # Electron 侧 TypeScript 配置
├── src/
│   ├── app/
│   │   ├── App.tsx               # 应用外壳：标题栏、侧边导航、主题入口、工作区组合
│   │   └── App.css               # 应用级布局与桌面壳样式
│   ├── components/
│   │   ├── ActionCard/           # 通用动作卡片组件
│   │   ├── Button/               # 通用按钮组件
│   │   └── Panel/                # 通用面板组件
│   ├── features/
│   │   └── creation-workbench/    # 创作工作台 feature：页面级 UI、局部交互和静态数据
│   ├── services/
│   │   ├── aiService.ts          # AI adapter 边界；当前为 mock client
│   │   └── rendererBridge.ts     # renderer 能力适配层；优先 Electron bridge，兼容 Web fallback
│   ├── styles/
│   │   └── global.css            # 全局样式、主题变量、基础 reset
│   ├── types/
│   │   ├── electronBridge.ts     # renderer 全局 bridge 类型声明
│   │   ├── global.d.ts           # 全局类型补充
│   │   └── workspace.ts          # 工作区、导航、生成任务等共享业务类型
│   ├── main.tsx                  # React renderer 入口
│   └── vite-env.d.ts             # Vite 类型声明
├── index.html                    # Vite HTML 入口
├── package.json                  # 脚本与依赖声明
├── tsconfig.json                 # renderer TypeScript 配置
└── vite.config.ts                # Vite 配置
```

### 分层原则

- `electron/main` 只放桌面主进程能力，不直接写 React UI。
- `electron/preload` 只暴露最小、显式、可类型化的 bridge API。
- `src/app` 负责应用壳组合，不承载具体业务算法。
- `src/features/<feature-name>` 承载页面级 feature，包括 feature 私有数据、局部状态和样式。
- `src/components` 放可复用、无业务绑定或低业务绑定的 UI 组件。
- `src/services` 放 renderer 侧 adapter/service 边界，屏蔽真实实现与 fallback 差异。
- `src/types` 放跨层共享类型，避免在组件中散落重复类型定义。

## 当前 mock / adapter 状态

### AI mock

- `src/services/aiService.ts` 当前是 **Mock AI Client**。
- 不会请求真实 AI API，也不读取真实密钥。
- 生成任务通过本地异步延迟模拟，返回排队中、生成中、已完成或失败等 mock 状态。
- renderer 可基于该 service 验证交互流程，但结果内容仅用于框架演示。

### 项目库 bridge / fallback

- v0.1 还没有真实项目库持久化服务。
- 当前 renderer bridge 模式已经建立：`src/services/rendererBridge.ts` 优先调用 `window.endlessCreationBridge`，在纯 Web/Vite 环境下使用浏览器 fallback。
- 已有 bridge 能力包括应用版本/平台、窗口控制、剪贴板写入、主题本地存储等基础能力。
- 后续项目库应沿用同样模式：先定义 typed bridge/service 接口，再在 Electron IPC 或 Web fallback 中实现，不让组件直接依赖 Electron API。

### 密钥状态

- 仓库中不包含真实 AI 服务密钥。
- 当前没有 `.env` 密钥约定或真实 provider 配置。
- 后续接入真实模型时，应通过本地安全配置、系统凭据或后端代理处理密钥，避免在 renderer 或 Git 仓库中暴露。

## 后续扩展方式

### 扩展 feature

1. 在 `src/features/` 下新增目录，例如 `src/features/project-library/`。
2. 目录内优先包含：
   - `FeatureName.tsx`：feature 容器组件
   - `FeatureName.css`：feature 私有样式
   - `data.ts`：临时静态数据或 mock 数据
   - `index.ts`：对外导出
3. 将跨 feature 共享的类型提升到 `src/types/`。
4. 将跨 feature 共享的 UI 下沉到 `src/components/`。
5. 不在 feature 组件中直接访问 Electron IPC、密钥或底层存储，统一通过 `src/services/`。

### 扩展 service / adapter

1. 先在 `src/services/` 定义稳定的 renderer 侧函数和类型。
2. 如果需要 Electron 能力：
   - 在 `electron/preload/bridgeTypes.ts` 增加最小 API 类型。
   - 在 `electron/preload/index.ts` 暴露对应方法。
   - 在 `electron/main/index.ts` 注册 IPC handler。
   - 在 `src/services/rendererBridge.ts` 增加 Electron bridge 调用与 Web fallback。
3. 组件只调用 service，不直接调用 `ipcRenderer`、`window.endlessCreationBridge` 或 Node/Electron API。
4. 真实 provider 与 mock provider 应保持同一返回类型，方便后续切换。

### 扩展 component

1. 在 `src/components/<ComponentName>/` 下 colocate 组件、样式和导出文件。
2. 组件 props 使用 TypeScript interface/type 明确定义。
3. 优先使用语义化 HTML 与可键盘访问的交互元素。
4. 样式优先使用 `src/styles/global.css` 中的 CSS variables，不引入额外 UI 库。
5. 组件保持可复用，不直接持有 feature 级业务流程。

## v0.1 边界

- 目标是原生桌面端 AI 创作平台框架版。
- 保留 mock 与 adapter 边界，验证架构可运行、可构建、可扩展。
- 不在 v0.1 继续扩展真实业务功能、真实 AI 接入或复杂项目库能力。
