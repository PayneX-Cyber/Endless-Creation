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
userData/novels/
```

产品归属：小说创作是顶层独立模块，不依赖项目管理。每本小说是独立本地创作对象；后续如需与项目、资产库、画布联动，通过引用关系接入，不改变第一阶段存储归属。

## 分阶段路线

### 第一阶段：小说创作基础框架

目标：先做可验收的本地小说工作台，不接 AI。

功能范围：

- 小说项目列表
- 新建小说
- 编辑小说基础信息
- 删除小说
- 小说详情页
- 章节正文编辑器
- 本地保存与重启恢复
- 保存状态：已保存 / 未保存 / 保存失败
- 删除确认：删除小说、删除章节都要二次确认
- 空状态：无小说、无章节时有明确引导
- 字数统计：当前章节字数和全书总字数，前端计算即可

验收标准：

- 重启应用后小说数据不丢失
- 可以新增、编辑、删除小说
- 可以新增、编辑、删除章节
- 快速编辑并切换章节后立刻重启，不丢内容
- 本地存储损坏时应用不崩溃，降级为空列表或错误提示
- 页面风格适配 Endless Creation，不照搬 NovelForge
- 不影响现有生图工作台、资产管理、API 配置

### 第二阶段：AI 文本生成

目标：复现 NovelForge 的核心 AI 写作链路。

链路：

```text
文本生成 Bridge + 复用模型偏好 → 最小端到端 AI 调用 → Prompt Registry → 第一个小说 AI 场景
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
- `backend/prompts/outline_generation.md`
- `backend/prompts/writing.md`
- `backend/prompts/screenwriting.md`

第二阶段第一个 AI 闭环建议只做“根据章节提示生成章节草稿”，不一次性实现完整“灵感 → 蓝图 → 大纲 → 正文”链路。

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

注意：第一阶段不得预埋 `versions`、`outline` 等字段；该结构从第三阶段开始引入。

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

第一阶段最小数据结构：

```ts
interface Novel {
  id: string;
  title: string;
  summary: string;
  note: string;
  chapters: Chapter[];
  version: 1;
  createdAt: string;
  updatedAt: string;
}

interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

保存要求：写入使用串行队列，避免快速编辑、切章、退出时丢数据。

第一阶段架构边界：

```ts
novel.listNovels(): Promise<{ ok: boolean; novels: NovelSummary[]; message?: string }>;
novel.createNovel(input: { title: string; summary?: string; note?: string }): Promise<{ ok: boolean; novel?: Novel; message: string }>;
novel.loadNovel(id: string): Promise<{ ok: boolean; novel?: Novel; message: string }>;
novel.saveNovel(novel: Novel): Promise<{ ok: boolean; novel?: Novel; message: string }>;
novel.deleteNovel(id: string): Promise<{ ok: boolean; message: string }>;
```

不做章节级 IPC。章节增删改在 renderer 内更新整本 `Novel`，再调用 `saveNovel(novel)`。

存储结构：

```text
userData/
  novels/
    {novelId}/
      novel.json
```

`listNovels()` 直接扫描 `novels/*/novel.json` 生成列表摘要；第一阶段不维护 `index.json`。不要拆每章一个文件。

性能登记：如果后续本地小说数量增长导致列表加载明显变慢，再引入 `index.json` 或摘要缓存；第一阶段不做。

`NovelSummary` 仅供列表使用：

```ts
type NovelSummary = Pick<Novel, "id" | "title" | "summary" | "createdAt" | "updatedAt"> & {
  chapterCount: number;
  wordCount: number;
};
```

写入边界：main 侧按 `novelId` 串行化 `saveNovel`，写入 `novel.json.tmp` 后 rename 为 `novel.json`。`saveNovel(currentNovel)` 即第一阶段最小 flush，不单独暴露 `flushNovel`。

错误处理：缺失 `novel.json` 时列表跳过、加载返回失败；JSON 损坏不崩溃，加载返回“小说文件损坏”；删除失败返回失败，UI 保持列表项；缺失字符串字段归一为空字符串，缺失 `chapters` 归一为空数组。

Web fallback：无 Electron bridge 时用 `localStorage` 存 `endless-creation.novels`，仅支持 `npm run dev` 预览，不作为正式存储。

第一阶段 UI/UX 边界：

- 入口页只展示“小说工作台”主入口、无小说空状态和最近小说；不展示“灵感模式”，即使置灰也不展示。
- 工作台采用三栏：左侧小说列表，中间小说信息与章节列表，右侧章节编辑器。
- 新建小说和编辑小说信息使用轻量弹窗；新建章节在章节栏内直接创建“未命名章节”并聚焦标题。
- 删除小说、删除章节必须二次确认；不做回收站。
- 编辑器顶部包含章节标题、保存状态、当前章字数、全书总字数和更新时间；正文区域保持朴素文本编辑，不做富文本工具栏。
- 保存状态包含：已保存、未保存、保存中、保存失败并可重试；提示轻量常驻，不打断写作。
- 无小说、无章节、未选择小说、加载失败、文件损坏都要有空态或错误态。
- 宽屏使用完整三栏；中等窗口压缩列表栏；窄窗口合并小说与章节栏，保证仍可选章和编辑正文。
- 视觉沿用 Endless Creation 蓝色桌面端风格，弱边框、大留白、克制阴影；不做 Web 落地页式大卡片堆砌。
- Phase 1 页面不得出现 AI、Prompt、世界观、角色卡、大纲生成、导入、封面、资产库联动入口。

## 第一阶段强约束

第一阶段只允许做：

```text
小说创作页 + 本地小说 CRUD + 章节编辑器 + 保存恢复 + 字数统计
```

不得提前实现：

- AI 生成
- RAG
- 登录
- 后端服务
- 云同步
- Prompt 管理后台
- 复杂版本系统
- 世界观结构化设定
- 角色卡系统
- 章节大纲结构化管理
- 小说导入
- 封面上传 / 生成
- 资产库联动

## 后续防跑偏检查

每个阶段开始前必须确认：

- 是否仍符合 Endless Creation 桌面端架构
- 是否复用已有 API 配置
- 是否避免整包复制 NovelForge
- 是否有独立可验收结果
- 是否没有提前引入后续阶段复杂度

## Prompt 管理策略

NovelForge 后台包含大量可编辑提示词。Endless Creation 前期不迁移后台管理，但不能跳过提示词体系。

第二阶段接入 AI 文本生成时，必须先打通文本生成 Bridge 并复用现有模型偏好，再实现本地内置 Prompt Registry：

```text
src/features/novel-creation/promptRegistry.ts
```

或等价的本地模块。

第一版优先内置以下 Prompt：

- `concept`
- `outline_generation`
- `writing`

可选补充：

- `screenwriting`
- `evaluation`
- `extraction`
- `chapter_plan`
- `optimize_dialogue`
- `optimize_environment`
- `optimize_psychology`
- `optimize_rhythm`

前期没有后台管理的影响：

- 不能在 UI 中编辑提示词
- 不能为不同用户配置不同提示词
- 不能在线调试 Prompt
- 不能管理 Prompt 版本

但不影响核心链路跑通。

后台提示词管理后置，稳定后再接入：

```text
设置页 → 小说创作 → 提示词管理
```

强约束：不得因为没有后台提示词管理而跳过 Prompt Registry，也不得在文本生成 Bridge 打通前堆不可验证的 Prompt 模板；不得提前迁移 NovelForge 管理后台。

## GitHub 最新仓库核对记录

核对源：`https://github.com/all666666all/AI-novel---NovelForge--`
核对提交：`77ce263`

本方案主线仍然成立：不迁移 Vue/FastAPI 技术栈，只在 Endless Creation 的 Electron + React 架构中复现产品能力。

### 后续能力登记

以下能力在源项目中存在，但不进入第一阶段。

#### 补充 Prompt 清单

除第二阶段优先 Prompt 外，后续还需要登记并按阶段迁移：

- `character_dna_guide`
- `constitution_check`
- `editor_review`
- `faction_context`
- `foreshadowing_reminder`
- `import_analysis`
- `rewrite_guardrails`
- `six_dimension_review`
- `writer_persona`
- `writing_v2`

#### 小说导入

源项目支持 `/novels/import`。Endless Creation 后续可做本地小说文件导入，但不放入第一阶段。

建议阶段：第三或第四阶段。

#### 封面能力

源项目支持封面生成和封面上传。Endless Creation 后续应优先复用已有生图工作台和资产库能力，不单独复制源项目封面实现。

建议阶段：第五阶段，与资产库联动。

#### 写作人格 / 阵营 / 宪章检查

源项目包含 `writer_persona`、`faction`、`constitution` 相关模型、服务和 Prompt。这些属于长篇一致性增强，不进入 MVP。

建议阶段：第四或第五阶段。

#### 高级审稿能力

源项目包含：

- 六维审稿
- 一致性检查
- 编辑审阅
- 改写护栏
- 读者模拟
- 自我批判

这些统一归入第四阶段「评估与优化」，不得提前塞进第一阶段。

### 明确不迁移项

以下能力不作为 Endless Creation 小说创作模块的前期目标：

- FastAPI 后端
- SQLAlchemy / MySQL
- Docker 部署
- JWT 登录
- 用户管理
- 请求限额
- 更新日志管理
- 源项目管理后台整体复制

## 第二参考源：AI_NovelGenerator 核对记录

参考源：`https://github.com/YILING0013/AI_NovelGenerator`

核对分支：

- `main`：`f9aefef`
- `dev`：`9f8504f`

结论：该项目可作为第二参考源，但只参考产品能力和流程设计，不迁移技术栈。

### 可参考能力

#### 任务模型路由

该项目把不同任务分配给不同模型配置，例如：

- 架构生成模型
- 章节大纲模型
- 草稿生成模型
- 最终正文模型
- 一致性审校模型

Endless Creation 后续可在「模型偏好」中扩展小说创作任务路由，但不进入第一阶段。

建议阶段：第二阶段之后。

#### 章节大纲解析

该项目包含 `chapter_directory_parser.py`，用于把 AI 生成的章节目录解析为结构化章节数据。

Endless Creation 后续生成章节大纲时，应参考这种轻量解析方式，不必一开始引入数据库或复杂 schema。

建议阶段：第二阶段。

#### 轻量一致性检查

该项目包含 `consistency_checker.py`，用小说设定、角色状态、前文摘要、未解决冲突和最新章节做一致性审校。

这比完整 RAG 更轻，适合 Endless Creation 在第四阶段先做轻量审校，再考虑长上下文记忆。

建议阶段：第四阶段。

#### 本地知识库参考

该项目支持本地文档参考和语义检索。Endless Creation 后续应优先和已有资产库打通，而不是直接迁移 ChromaDB 或 LangChain。

建议阶段：第五或第六阶段。

### 不迁移项

以下内容不进入 Endless Creation 前期路线：

- CustomTkinter UI
- Python 运行时
- ChromaDB
- LangChain
- MongoDB
- FastAPI
- Next.js
- 代理设置
- WebDAV

### 对现有路线的影响

第一阶段不变：

```text
小说创作页 + 本地小说 CRUD + 章节编辑器 + 保存恢复 + 字数统计
```

第二阶段之后补充：

- 任务模型路由
- 章节大纲解析

第四阶段补充：

- 轻量一致性检查

第五或第六阶段补充：

- 本地知识库 / 资产库参考

## 第三参考源：novelWriter 核对记录

参考源：`https://github.com/vkbo/novelWriter`

核对提交：`d87b1be`

结论：novelWriter 不是 AI 生成器，而是专业小说编辑器。它只作为小说编辑体验、项目组织、文稿导出方向的参考，不复制代码。

许可证注意：novelWriter 使用 GPLv3，Endless Creation 只能参考产品设计和概念，不能直接迁移源码。

### 可参考能力

#### 小说项目树结构

novelWriter 将小说项目拆成不同根目录类型：

- Novel：正文
- Plot：剧情线
- Characters：角色
- Locations：地点
- Timeline：时间线
- Objects：物品
- Entities：组织或实体
- Archive：归档
- Trash：回收站

Endless Creation 后续可参考该结构设计「小说创作」左侧项目树，但第一阶段仍只做最小小说列表和章节编辑。

建议阶段：第三阶段之后。

#### 章节 / 场景层级

novelWriter 用标题层级表达小说结构：

- `#`：分部
- `##`：章节
- `###`：场景
- `####`：小节

Endless Creation 后续可以从单纯章节列表升级为分部、章节、场景、小节结构。

建议阶段：第三阶段之后。

#### 标签与引用系统

novelWriter 支持 `@tag` 和引用系统，用于把角色、地点、物品、剧情线与正文片段关联。

Endless Creation 后续应优先与已有资产库打通，把角色、地点、物品、设定作为可引用资产。

建议阶段：第五阶段。

#### 纯文本 / 多文件存储思想

novelWriter 强调人类可读文本、多文件存储、易备份、易同步。

Endless Creation 第一阶段可以继续使用 JSON；后续若进入专业写作模式，可考虑增加 Markdown/TXT 导出或 sidecar 文本文件，但不提前复杂化存储。

建议阶段：第三阶段之后。

#### 文稿构建与导出

novelWriter 支持从多个章节和场景构建完整 manuscript。

Endless Creation 后续可支持导出：

- Markdown
- TXT
- DOCX

建议阶段：第五阶段。

#### 写作统计

novelWriter 有字数统计、会话统计、写作进度记录。

Endless Creation 可在章节编辑稳定后加入基础字数和进度统计。

建议阶段：第三或第四阶段。

### 不迁移项

以下内容不进入 Endless Creation 路线：

- Python 运行时
- PyQt6 UI
- GPLv3 源码
- novelWriter 完整项目格式
- novelWriter 主题和编辑器实现

## 扩展参考池核对记录

以下仓库作为扩展参考池，只登记可借鉴的产品能力、流程和架构思路，不直接迁移源码。

### RhythmicWave/NovelForge

参考源：`https://github.com/RhythmicWave/NovelForge`

核对提交：`ca7ca58`

许可证：AGPL-3.0，不能直接复制源码。

可参考点：

- Schema-first 卡片创作
- Prompt Workshop
- `@DSL` 上下文注入
- 工作流 Studio
- 工作流 Agent
- 灵感工作台
- 知识图谱一致性

建议阶段：第四阶段之后，作为高级工作流和上下文注入参考。

### ExplosiveCoderflome/AI-Novel-Writing-Assistant

参考源：`https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant`

核对提交：`69de240`

许可证：AGPL-3.0，不能直接复制源码。

可参考点：

- 自动导演开书
- 整本书生产主链
- 检查点恢复
- 自动审核与修复
- 角色资源账本
- Creative Hub
- Agent Runtime
- 漫画、短剧等衍生工坊

建议阶段：第五阶段之后，作为自动化生产链参考。

### leenbj/novel-creator-skill

参考源：`https://github.com/leenbj/novel-creator-skill`

核对提交：`a327428`

可参考点：

- 长篇创作 Skill 化流程
- 每章五步质量门禁
- RAG 剧情检索
- 知识图谱
- 大纲锚点
- 跨 Agent 审稿
- 去 AI 味润色规则
- 事件矩阵与冷却

建议阶段：第四阶段之后，作为质量门禁和协作流程参考。

### Narcooo/inkos

参考源：`https://github.com/Narcooo/inkos`

核对提交：`d0fc38a`

许可证：AGPL-3.0，不能直接复制源码。

可参考点：

- 长篇、短篇、剧本、同人、续写、互动世界统一入口
- Studio / TUI / CLI 多入口共享执行内核
- protected / compressible 上下文分层
- 开放世界状态维护
- 封面生成服务配置
- 多服务模型配置

建议阶段：第五阶段之后，作为多创作形态和互动世界参考。

### Deng-m1/MaliangAINovalWriter

参考源：`https://github.com/Deng-m1/MaliangAINovalWriter`

核对提交：`f500d01`

许可证：Apache-2.0。

可参考点：

- 作品 → 卷 → 章节 → 场景四级结构
- 沉浸式编辑区 AI 工具栏
- 大纲与聊天并行
- 结构化设定树
- 设定历史快照
- 提示词和预设管理
- AI 调用可观测性
- Token 消耗统计
- 多格式导入

建议阶段：第三阶段之后，作为编辑器体验、设定树和统计面板参考。

### inliver233/Ai-Novel

参考源：`https://github.com/inliver233/Ai-Novel`

核对提交：`28d7535`

许可证：MIT。

可参考点：

- 世界书
- 角色卡
- 术语表
- Story memories
- Open loops 管理
- 结构化记忆变更集
- 项目 Bundle 导入导出
- Markdown 导出
- Prompt blocks
- LLM preset 和用户 profile

建议阶段：第四阶段之后，作为记忆系统和导入导出参考。

### zqaini002/Novel_Wonderful-generation

参考源：`https://github.com/zqaini002/Novel_Wonderful-generation`

核对提交：`87d6c65`

许可证：README 标注 MIT，但未在轻量核对中确认独立许可证文件。

可参考点：

- 小说上传
- 章节识别与提取
- 小说处理状态跟踪
- 小说摘要与标签
- 内容理解和筛选辅助

建议阶段：第三阶段之后，作为小说导入和解析参考。

### xindoo/ai-novel-lab

参考源：`https://github.com/xindoo/ai-novel-lab`

核对提交：`d2974b6`

许可证：MIT。

可参考点：

- 大纲驱动写作
- 章节文件按编号落盘
- 进度追踪表
- 字数统计脚本
- 章节网站阅读端
- 完整长篇创作复盘

建议阶段：第三阶段之后，作为文件组织、进度追踪和发布阅读端参考。

### 扩展参考池使用原则

- 第一阶段仍不变：小说创作页 + 本地小说 CRUD + 章节编辑器 + 保存恢复 + 字数统计。
- AGPL/GPL 仓库只参考产品设计和流程，禁止复制源码。
- MIT/Apache 仓库也优先参考思路，不直接搬技术栈。
- 所有参考点进入对应阶段，不允许提前塞进 MVP。

