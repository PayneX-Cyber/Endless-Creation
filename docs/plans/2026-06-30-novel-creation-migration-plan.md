# 小说创作模块复现方案

日期：2026-06-30
目标源项目：`C:\Users\x1176\Documents\Codex\2026-06-18\all666666all-ai-novel-novelforge-https-github`
目标项目：Endless Creation Electron + React 桌面端

## 目标定位

本方案不把 NovelForge 的 Vue/FastAPI 技术栈整包迁入 Endless Creation，而是在现有桌面端架构内复现其产品能力。

目标是：在 Endless Creation 中新增一个原生桌面端「小说创作」模块，先跑通本地创作工作流，再逐步接入 AI、多版本、评估和长上下文能力。

## 不做什么

第一阶段禁止引入以下内容：

- Vue / Pinia / Naive UI
- FastAPI 后端
- JWT / 登录系统
- MySQL / SQLAlchemy
- RAG / 向量库 / embedding
- 管理后台
- NovelForge 整包复制
- 新增大型依赖

## 保留的项目架构

继续沿用 Endless Creation 当前架构：

```text
React UI
  ↓
rendererBridge
  ↓
Electron Main
  ↓
userData 本地文件
  ↓
现有 API 配置中的 OpenAI-compatible 渠道
```

新增前端模块建议放在：

```text
src/features/novel-creation
```

本地数据建议放在：

```text
userData/projects/default/novels/
```

## 分阶段路线

### 第一阶段：小说创作基础框架

目标：先做可验收的本地小说工作台，不接 AI。

功能范围：

- 小说项目列表
- 新建小说
- 编辑小说基础信息
- 删除小说
- 小说详情页
- 世界观设定
- 角色设定
- 章节大纲
- 章节正文编辑器
- 本地保存与重启恢复

验收标准：

- 重启应用后小说数据不丢失
- 可以新增、编辑、删除小说
- 可以新增、编辑、删除章节
- 页面风格适配 Endless Creation，不照搬 NovelForge
- 不影响现有生图工作台、资产管理、API 配置

### 第二阶段：AI 文本生成

目标：复现 NovelForge 的核心 AI 写作链路。

链路：

```text
灵感输入 → 故事蓝图 → 章节大纲 → 章节正文
```

需要新增最小文本生成桥接：

```ts
rendererBridge.generateText()
```

Electron Main 调用 OpenAI-compatible：

```text
/v1/chat/completions
```

复用现有 API 配置、模型偏好、渠道配置，不另做小说专用 API 设置。

可参考迁移的 Prompt：

- `backend/prompts/concept.md`
- `backend/prompts/screenwriting.md`
- `backend/prompts/outline_generation.md`
- `backend/prompts/writing.md`

### 第三阶段：多版本章节生成

目标：复现多版本草稿选择。

功能范围：

- 每章生成多个版本
- 展示版本列表
- 用户选择最终版本
- 支持手动编辑
- 保留版本历史

核心数据结构：

```ts
interface Chapter {
  id: string;
  title: string;
  outline: string;
  selectedVersionId?: string;
  versions: ChapterVersion[];
}
```

### 第四阶段：评估与优化

目标：把 AI 从生成器升级为写作助手。

功能范围：

- 章节评价
- 节奏检查
- 人物一致性检查
- 对话优化
- 环境描写优化
- 心理描写优化

本阶段本质是：Prompt + 当前小说上下文 + 文本生成接口。

可参考迁移的 Prompt：

- `backend/prompts/evaluation.md`
- `backend/prompts/optimize_dialogue.md`
- `backend/prompts/optimize_environment.md`
- `backend/prompts/optimize_psychology.md`
- `backend/prompts/optimize_rhythm.md`

### 第五阶段：创作管理增强

功能范围：

- 伏笔记录
- 伏笔回收提醒
- 角色关系图
- 情绪曲线
- 章节完成度
- 小说统计
- 与资产库联动

### 第六阶段：长上下文记忆 / RAG

最后再做。

功能范围：

- 章节摘要
- 历史章节检索
- embedding
- 向量记忆
- 长篇一致性增强

只有进入本阶段时，才评估 SQLite、向量库和 RAG 服务。

## 推荐实施顺序

1. 架构负责人：确认小说数据结构、本地存储路径、Bridge 边界。
2. 产品负责人：确认 MVP 页面范围和验收标准。
3. UI/UX 设计师：给小说创作模块布局规范。
4. 前端工程师：实现第一阶段。
5. QA 工程师：只复验第一阶段。

## 第一阶段强约束

第一阶段只允许做：

```text
小说创作页 + 本地小说项目 CRUD + 章节编辑器
```

不得提前实现：

- AI 生成
- RAG
- 登录
- 后端服务
- 云同步
- Prompt 管理后台
- 复杂版本系统

## 后续防跑偏检查

每个阶段开始前必须确认：

- 是否仍符合 Endless Creation 桌面端架构
- 是否复用已有 API 配置
- 是否避免整包复制 NovelForge
- 是否有独立可验收结果
- 是否没有提前引入后续阶段复杂度
