# Endless Creation

Endless Creation 是一个基于 Electron、React 和 TypeScript 的本地优先 AI 创作桌面应用。

当前 V1 Beta 已具备小说项目、稿件导入与自动分章、灵感到正文生成、设定管理、多版本草稿、章节评审与优化、伏笔管理、人物关系图谱、情感曲线、AI 成本统计，以及 Markdown、Word、ZIP 导出闭环。

## 快速开始

```powershell
npm.cmd ci
npm.cmd run dev:electron
```

| 命令 | 用途 |
| --- | --- |
| `npm.cmd run dev` | 启动纯 Vite renderer |
| `npm.cmd run dev:electron` | 启动 Vite 与 Electron 桌面应用 |
| `npm.cmd run build` | 构建 renderer 与 Electron |
| `npm.cmd run check` | 当前等同完整构建检查 |

## 技术栈

- Electron 42
- React 19
- TypeScript 6
- Vite 8
- 本地文件与 localStorage 持久化
- OpenAI-compatible 文本和图像生成接口

## 目录

```text
electron/              Electron 主进程、preload 与 IPC
src/app/               应用外壳与导航
src/components/        通用 UI 组件
src/features/          小说、生图、资产、画布、设置等功能
src/services/          renderer adapter 与 bridge
src/types/             跨层共享类型
docs/                  架构、历史计划和 QA 记录
openspec/              OpenSpec 当前规格与变更
docs/superpowers/      Superpowers 技术设计与实施计划
.comet/                Comet 工作流配置
```

## 文档入口

从 [docs/README.md](docs/README.md) 开始阅读。

- 当前路线图：[V1.0 执行路线图](docs/plans/2026-07-06-v1-roadmap-adjusted.md)
- Agent 规则：[AGENTS.md](AGENTS.md)
- OpenSpec 配置：[openspec/config.yaml](openspec/config.yaml)
- Comet 配置：[.comet/config.yaml](.comet/config.yaml)

## 开发约束

- 新能力默认走 Comet：OpenSpec 负责 WHAT，Superpowers 负责 HOW。
- 已完成的旧计划保留为历史记录，不作为当前代码事实源。
- renderer 不直接调用 Node/Electron API，统一经过 preload 与 service adapter。
- AI 结构化结果先进入候选态，用户确认后才写入项目数据。
- 代码改动完成后运行 `npm.cmd run build`；UI 文案改动还需执行项目文本完整性扫描。
