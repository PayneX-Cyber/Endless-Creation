# Comet Design Handoff

- Change: add-novel-volume-structure
- Phase: design
- Mode: compact
- Context hash: 3412c12778e872821607e3e8665877bcda94733e41e9cfdfbbd8ce6be165d78f

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/add-novel-volume-structure/proposal.md

- Source: openspec/changes/add-novel-volume-structure/proposal.md
- Lines: 1-32
- SHA256: cca51c420c050ba419e58ec082601b3c97e669b77a3b94f083ea20bebd196843

```md
## Why

现有小说数据只有扁平的 `Novel.chapters[]`，长篇作品无法按卷组织章节，导航、导出和生成上下文也缺少稳定的卷序语义。项目目标已从 MVP 转为可上线长期使用，需要在不破坏 `chapterId` 与 `chapter.content` 契约的前提下补齐生产级卷管理能力。

## What Changes

- **BREAKING（数据层）**：`Novel` schema 从 version 6 升至 version 7，新增 `volumes: Volume[]`；`Chapter` 新增可选 `volumeId`。
- 新增卷的创建、重命名、排序和安全删除；删除卷时卷内章节移入“未分卷”，禁止级联删除章节。
- 新增章节归卷、移出卷和跨卷移动；章节仍保存在扁平 `Novel.chapters[]`，`chapterId` 与正文结构不变。
- 定义统一章节展开顺序：正式卷按 `Volume.order`，卷内按 `Chapter.order`，未分卷章节恒定排在末尾。
- 提供可实际使用的卷管理 UI，并让导航、搜索、导出和 Prompt 上下文统一消费同一个卷序展开函数。
- v6→v7 迁移不虚构卷：老章节保持 `volumeId` 为空并进入“未分卷”区；缺失或损坏的卷数据归一为空数组。
- 不新增卷专用 IPC，继续通过现有 `saveNovel(novel)` 整体持久化链保存。

## Capabilities

### New Capabilities

- `novel-volume-structure`: 卷数据模型、v6→v7 兼容迁移、卷 CRUD/排序、章节归卷与卷管理 UI。

### Modified Capabilities

- `chapter-reorder`: 章节重排从全局顺序扩展为卷内与跨卷顺序，并保持连续、确定的卷序展开结果。
- `chapter-search`: 搜索结果中的章号和结果顺序改为统一卷序展开顺序。

## Impact

- **Schema / 持久化**：同步修改 renderer、preload、main 三份 `Novel`/`Chapter` 类型与主进程 `sanitizeNovel`；version 6→7。复用现有小说整体保存与原子写入，不新增 IPC。
- **前端**：小说项目视图与工作台章节导航新增卷分组和管理交互；章节重排支持卷内和跨卷移动。
- **排序消费者**：导出、导航、跨章搜索、Prompt 前文上下文、统计及其他依赖章节顺序的模块改用统一的 `orderedChapters(novel)`。
- **兼容性**：伏笔、情感曲线、分析持久化继续使用原 `chapterId`；`chapter.content`、版本历史和编辑器正文契约不变。
- **非目标**：不新增 Scene 层级，不下沉正文，不改 `NovelSummary`，不做 v7→v8，不新增依赖。

```

## openspec/changes/add-novel-volume-structure/design.md

- Source: openspec/changes/add-novel-volume-structure/design.md
- Lines: 1-130
- SHA256: 4f29d28a4b751c1333449686122e49a38ee1c81770f30e12039151e79a9c4b12

[TRUNCATED]

```md
## Context

当前小说 schema 为 version 6，`Novel.chapters[]` 是唯一章节集合，`Chapter.order` 表示全局顺序。导航、跨章搜索、导出、Prompt 前文上下文、统计、情感曲线与人物图谱等模块分别自行按 `order` 排序，尚无统一的结构顺序入口。主进程 `sanitizeNovel` 是 Electron 数据加载与保存的消毒入口，Web 预览模式另有 `normalizeWebNovel`；renderer 通过现有 `updateNovel` / `saveNovel(novel)` 整体保存并使用 600ms 自动保存链。

本 change 在保持章节扁平存储的前提下引入卷元数据。`chapterId`、`chapter.content`、伏笔引用、情感曲线点与分析持久化的锚点均保持不变。约束包括：不新增 IPC、不新增依赖、不修改 `NovelSummary`，并为后续 Scene 层级保留清晰边界。

## Goals / Non-Goals

**Goals:**
- 将 schema 升级到 version 7，新增 `Volume[]` 与 `Chapter.volumeId?`，兼容迁移 v6 小说。
- 提供卷创建、重命名、排序、安全删除，以及章节归卷、移出卷和跨卷移动。
- 用单一纯函数定义“正式卷顺序 + 卷内章节顺序 + 未分卷末尾”的确定性展开结果。
- 在项目“章节大纲”页交付可管理 UI，在项目章节列表与工作台侧栏交付一致的卷分组导航。
- 复用现有整本 Novel 保存链，保证重启后卷、归属和顺序不丢失。

**Non-Goals:**
- 不新增 Scene 层级，不把正文从 `Chapter.content` 下沉。
- 不改变任何基于 `chapterId` 的业务引用。
- 不新增卷专用 IPC、数据库、索引或第三方拖拽依赖。
- 不为 `NovelSummary` 增加 `volumeCount`，不改变小说列表摘要。
- 不实现 v7→v8 或完整四级结构。

## Decisions

### D1：采用扁平章节 + 卷元数据，schema version 6→7

新增：

```ts
interface Volume {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface Chapter {
  // 既有字段保持不变
  volumeId?: string;
}

interface Novel {
  volumes: Volume[];
  chapters: Chapter[];
  version: 7;
}
```

`Novel.chapters[]` 不嵌套进卷，所有现有 `chapterId` 查找和正文读写继续成立。替代方案是 `volume.chapters[]` 嵌套结构，但会迫使编辑器、伏笔、分析、导出与主进程 IPC 契约同时重构，因此本 change 不采用。

### D2：`Chapter.order` 改为所属分组内顺序，未分卷是虚拟末尾分组

正式卷先按 `Volume.order` 升序；每个卷内按 `Chapter.order` 升序；`volumeId` 为空或无法匹配现有卷的章节归入虚拟“未分卷”分组，并恒定排在所有正式卷之后。每个分组的章节 `order` 独立归一为 `0..n-1`，不同卷之间允许出现相同 `order`。

卷本身的 `order` 同样归一为 `0..n-1`。排序相同时以原数组位置作稳定兜底，避免损坏数据或旧数据产生非确定结果。

### D3：renderer 只暴露一个章节展开入口

新增小型纯函数模块，至少提供：

- `orderedChapters(novel)`：返回卷序展开后的新数组，不修改原对象。
- `groupChaptersByVolume(novel)`：为 UI 返回正式卷分组及虚拟未分卷分组。
- `moveChapterInStructure(...)`：同时处理卷内重排、跨卷移动与归属更新，并归一源/目标分组。
- `reorderVolumes(...)`、`deleteVolume(...)`：归一卷序；删除卷时清空相关章节的 `volumeId`。

导航、工作台、搜索、导出、Prompt 上下文、统计、情感曲线和人物图谱等所有依赖章节先后关系的消费者改用 `orderedChapters(novel)` 或接收其结果，不再各自直接对 `novel.chapters` 做全局 `order` 排序。计数、按 id 查找等与顺序无关的逻辑无需强制改写。

### D4：所有卷变更均在 renderer 内更新整本 Novel

卷 CRUD、卷排序、章节归卷与重排都通过纯函数生成新的 `Novel`，再进入现有 `updateNovel` → 600ms 自动保存 → `saveNovel` 链。不会新增 `createVolume`、`moveChapterToVolume` 等 IPC。Electron 保存仍使用现有临时文件写入后 rename 的原子替换；Web 预览继续写 localStorage fallback。

卷和章节的拖拽、上下移按钮、归属选择控件必须调用同一组结构变更函数，避免出现两套 order 语义。每次结构变更同时刷新相关对象的 `updatedAt`。

### D5：迁移与消毒在 Electron 和 Web fallback 两条入口保持同义

主进程 `sanitizeNovel` 与 renderer `normalizeWebNovel` 都升级为 version 7：

1. `volumes` 缺失或不是数组时归一为 `[]`。
2. 卷条目逐项校验；非法条目丢弃，合法条目补齐 id、时间并归一 `order`。

```

Full source: openspec/changes/add-novel-volume-structure/design.md

## openspec/changes/add-novel-volume-structure/tasks.md

- Source: openspec/changes/add-novel-volume-structure/tasks.md
- Lines: 1-37
- SHA256: 720961457f3b6bf4e250b3315cb4049d1c3e0a736ce475219303eb0054bdb295

```md
## 1. Schema v7 与兼容迁移

- [ ] 1.1 在 `src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts` 同步新增 `Volume`、`Novel.volumes`、`Chapter.volumeId?`，并将 Novel version 从 6 升为 7；保持 `NovelSummary` 不新增 `volumeCount`
- [ ] 1.2 扩展主进程 `sanitizeNovel`：先消毒并归一卷，再校验章节 `volumeId`，将无效归属降级为未分卷，按分组归一 chapter order；v6 老章节保持相对顺序且不自动建卷
- [ ] 1.3 更新 Electron `createNovel` 与 renderer Web fallback 的 `createNovel` / `normalizeWebNovel`：新小说初始化 `volumes: []`、version 7，Web 预览与 Electron 使用同一迁移语义

## 2. 统一卷序与结构变更函数

- [ ] 2.1 新建独立小模块实现 `orderedChapters(novel)` 与 UI 分组函数：正式卷按 volume order、卷内按 chapter order、未分卷恒定居末；排序不得原地修改 Novel
- [ ] 2.2 在同一模块实现卷创建/重命名/重排/安全删除，以及章节卷内重排、跨卷移动、移入未分卷；所有入口共用同一归属更新与源/目标分组 order 归一逻辑
- [ ] 2.3 为卷序和结构纯函数补充项目现有风格的自检，覆盖 v6 未分卷、稳定排序、组内归一、跨卷移动、删除卷不删章和无效 volumeId 降级

## 3. 顺序消费者统一接入

- [ ] 3.1 改造 `NovelCreation`、`ChapterWorkbench` 与 `novelNavigation`：章节列表、激活首章、跨章搜索结果顺序和章号均来自统一卷序，不再自行全局按 chapter order 排序
- [ ] 3.2 改造 `novelExport` 与 Prompt 调用链：整书导出、离线包结构、前一章上下文、缺失大纲等需要先后关系的输入统一按卷序展开
- [ ] 3.3 改造 `NovelStats`、`EmotionArcPanel`、`characterGraph` 及其余顺序消费者，确保“第 N 章”和分析输入一致；扫描并清理遗留的直接全局 chapter order 排序点
- [ ] 3.4 保持伏笔、情感曲线、人物图谱和分析持久化的 `chapterId` 引用原样，确认计数/按 id 查找等与顺序无关的逻辑没有被误改

## 4. 卷管理与分组导航 UI

- [ ] 4.1 在独立小组件/文案模块中实现卷管理头部：新建、非空重命名、上移/下移、删除确认；删除提示受影响章节数并明确章节只移入“未分卷”
- [ ] 4.2 将“章节大纲”页改为正式卷 + 未分卷的分组列表，接入卷 CRUD、卷内上移/下移、原生拖拽换位/跨卷放置和章节卷归属选择控件
- [ ] 4.3 将“章节内容”页与工作台左侧章节导航改为只读卷分组展示，维持 active chapter、搜索定位、生成中 busy gate 和正文编辑流程
- [ ] 4.4 完成卷区、放置目标、空态与响应式样式；上移/下移/删除/归属控件具有明确 aria-label，边界按钮禁用，键盘用户无需拖拽即可完成全部结构操作

## 5. 持久化与回归边界

- [ ] 5.1 所有卷 CRUD、卷排序、归卷和重排均通过现有 `updateNovel` → 自动保存 → `saveNovel(novel)` 链持久化，不新增卷专用 IPC 或依赖
- [ ] 5.2 覆盖损坏/缺失 volumes、孤儿 volumeId、空卷、删除当前卷、跨卷移动当前激活章节等边界，保证章节 id、正文、版本历史和引用数据不丢失

## 6. 验证与交付

- [ ] 6.1 运行 `npm.cmd run build`，确保 renderer tsc + Vite 与 Electron tsc 全部 exit 0
- [ ] 6.2 运行文本完整性扫描 `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"` 并得到 `TEXT INTEGRITY OK`；运行 `git diff --check` 无空白错误
- [ ] 6.3 GUI 真机验收 spec 场景：卷 CRUD/确认删除、卷排序、归卷/移出/跨卷、拖拽与键盘路径、未分卷末尾、重启持久化、搜索章号及导出/Prompt/统计/图谱顺序一致
- [ ] 6.4 逐项勾选 tasks 后，仅提交本 change 的源文件与 artifacts，保持平台/工具未跟踪目录不入库，并以单个 coherent feature commit 收口

```

## openspec/changes/add-novel-volume-structure/specs/chapter-reorder/spec.md

- Source: openspec/changes/add-novel-volume-structure/specs/chapter-reorder/spec.md
- Lines: 1-67
- SHA256: e79c95722815984ac2d21778511988aa27c9435e54b85b0e97a38c88df49d101

```md
## MODIFIED Requirements

### Requirement: 章节重排交互

系统 SHALL 在按卷分组的章节列表中提供拖拽与上移/下移按钮来调整章节顺序，并提供卷归属选择控件作为跨卷移动的键盘路径。任一入口完成一次顺序调整后，系统 MUST 立即将新顺序和新归属反映在列表上。

#### Scenario: 卷内上移章节

- **WHEN** 用户对某卷内的非首章点击"上移"
- **THEN** 该章与同卷前一章交换顺序
- **AND** 列表按新顺序显示

#### Scenario: 卷内下移章节

- **WHEN** 用户对某卷内的非末章点击"下移"
- **THEN** 该章与同卷后一章交换顺序
- **AND** 列表按新顺序显示

#### Scenario: 分组边界禁用

- **WHEN** 章节位于所属卷或“未分卷”分组的首位
- **THEN** 其"上移"不可用
- **AND** 所属分组末位章节的"下移"不可用

#### Scenario: 拖拽到同卷新位置

- **WHEN** 用户将某章拖拽并放置到同一分组的另一位置
- **THEN** 该章移动到目标位置，其余同组章节顺序相应调整
- **AND** 章节归属保持不变

#### Scenario: 拖拽到另一卷

- **WHEN** 用户将某章拖拽并放置到另一正式卷或“未分卷”区
- **THEN** 该章移动到目标分组的目标位置
- **AND** 章节归属与列表分组立即更新

#### Scenario: 不使用拖拽时跨卷移动

- **WHEN** 用户通过卷归属选择控件选择另一正式卷或“未分卷”
- **THEN** 系统完成与跨卷拖拽等价的归属更新
- **AND** 该控件可通过键盘操作并具有明确的可访问名称

### Requirement: 重排后 order 归一化与持久化

一次卷内或跨卷重排后，系统 SHALL 将受影响分组内所有章节的 `order` 字段分别重写为从 0 起的连续整数，并经现有 `updateNovel` → `saveNovel` 链自动保存。跨卷移动 SHALL 同时更新目标章节的 `volumeId`；系统 MUST NOT 为重排或归卷新增 IPC 通道。

#### Scenario: 卷内重排后自动保存并跨会话保留

- **WHEN** 用户调整卷内章节顺序后关闭并重新打开该小说
- **THEN** 章节在原卷内以调整后的顺序显示

#### Scenario: 跨卷移动后双侧归一

- **WHEN** 用户把章节从源卷移动到目标卷或“未分卷”
- **THEN** 源分组和目标分组的章节 order 均从 0 起连续
- **AND** 被移动章节的 volumeId 与目标分组一致

#### Scenario: 拖拽与按钮共用顺序语义

- **WHEN** 用户分别通过拖拽、上移/下移或卷归属控件调整结构
- **THEN** 三种入口产生相同的分组归属与 order 归一化规则

#### Scenario: order 消费者跟随卷序结果

- **WHEN** 卷顺序、章节归属或卷内章节顺序被调整
- **THEN** 导出、导航、搜索章号、前文上下文 prompt、统计与图谱等顺序消费方均按统一卷序展开结果生效
- **AND** 无需用户额外操作

```

## openspec/changes/add-novel-volume-structure/specs/chapter-search/spec.md

- Source: openspec/changes/add-novel-volume-structure/specs/chapter-search/spec.md
- Lines: 1-37
- SHA256: 65bcec37f4f278614b2a198da16605c2143dc4c921674ab61ad12713487a57b9

```md
## MODIFIED Requirements

### Requirement: 跨章全文搜索

系统 SHALL 提供搜索入口，接受关键词，按统一卷序展开当前小说的所有章节并扫描其 `title`、`content` 与 `outline`，返回命中章节列表。每条结果 MUST 包含基于统一卷序计算的章号、章节标题与包含关键词的摘要片段。搜索为纯读操作，MUST NOT 修改小说数据。

#### Scenario: 关键词命中多章

- **WHEN** 用户输入一个在多个章节正文中出现的关键词并触发搜索
- **THEN** 系统按统一卷序列出所有命中章节，每条含章号、标题与命中处的摘要片段
- **AND** 摘要片段中关键词可辨识（高亮或标注）

#### Scenario: 搜索大纲与标题

- **WHEN** 关键词只出现在某章的 `outline` 或 `title` 中
- **THEN** 该章仍出现在结果中，并标明命中来源

#### Scenario: 章号跟随卷序

- **WHEN** 卷顺序、章节归属或卷内章节顺序发生变化后再次搜索
- **THEN** 搜索结果顺序与统一卷序展开结果一致
- **AND** 每条结果的章号等于该章节在统一展开结果中的位置加一

#### Scenario: 未分卷结果居末

- **WHEN** 正式卷章节与未分卷章节均命中关键词
- **THEN** 未分卷章节的结果排在所有正式卷命中结果之后

#### Scenario: 无命中

- **WHEN** 关键词在任何章节的 title/content/outline 中都不存在
- **THEN** 系统显示无结果提示，不报错

#### Scenario: 空关键词

- **WHEN** 用户在关键词为空或仅空白时触发搜索
- **THEN** 系统不执行搜索，不产生结果列表

```

## openspec/changes/add-novel-volume-structure/specs/novel-volume-structure/spec.md

- Source: openspec/changes/add-novel-volume-structure/specs/novel-volume-structure/spec.md
- Lines: 1-185
- SHA256: ad9903ea3ca2d6e6d4393cb295a7858ce49a2a601c69f4d0f0403d089050a8c2

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 卷数据模型与 v6→v7 兼容迁移

系统 SHALL 将小说 schema 升级为 version 7，为 `Novel` 增加 `volumes: Volume[]`，并为 `Chapter` 增加可选 `volumeId`。章节 MUST 继续保存在扁平 `Novel.chapters[]` 中，既有 `chapterId`、`chapter.content` 及其业务引用 MUST 保持不变。

#### Scenario: 新建小说初始化卷结构

- **WHEN** 用户新建一部小说
- **THEN** 系统创建 version 7 的 Novel
- **AND** `volumes` 初始化为空数组
- **AND** 不自动创建任何默认卷

#### Scenario: 加载 v6 老小说

- **WHEN** 系统加载一部 version 6 且没有 `volumes` 与 `volumeId` 的小说
- **THEN** 系统将其归一为 version 7
- **AND** 所有老章节保持原有相对顺序并进入“未分卷”
- **AND** 不虚构“第一卷”或其他卷

#### Scenario: 卷数据缺失或损坏

- **WHEN** 小说的 `volumes` 缺失、不是数组或包含非法卷条目
- **THEN** 系统丢弃非法条目并得到可用的卷数组
- **AND** 引用不存在卷的章节进入“未分卷”
- **AND** 小说仍可正常加载和编辑

#### Scenario: 章节锚点保持稳定

- **WHEN** 小说从 v6 迁移到 v7 或章节在卷之间移动
- **THEN** 章节 id、正文、大纲、版本历史、伏笔引用、情感曲线点与分析持久化引用均不被重建或改写

### Requirement: 统一卷序展开

系统 SHALL 通过统一顺序规则展开章节：正式卷按 `Volume.order` 升序，各卷内章节按 `Chapter.order` 升序，未分卷章节按自身 `Chapter.order` 升序并恒定排在所有正式卷之后。所有依赖章节先后关系的功能 MUST 使用同一展开结果。

#### Scenario: 正式卷与卷内章节排序

- **WHEN** 小说包含多个正式卷且各卷包含多个章节
- **THEN** 系统先按卷 order 排列正式卷
- **AND** 再按每个卷内的 chapter order 排列章节

#### Scenario: 未分卷恒定居末

- **WHEN** 小说同时包含正式卷章节与未分卷章节
- **THEN** 所有未分卷章节显示在最后一个正式卷之后
- **AND** 未分卷章节之间按自身 order 排列

#### Scenario: 顺序消费者保持一致

- **WHEN** 卷顺序、章节归属或卷内章节顺序发生变化
- **THEN** 项目导航、工作台导航、跨章搜索、导出、Prompt 前文上下文、统计、情感曲线与人物图谱均使用相同章节顺序
- **AND** 同一章节在各功能中的章号保持一致

### Requirement: 卷创建、重命名、排序与安全删除

系统 SHALL 在小说项目中提供卷的创建、重命名、上移、下移和删除。卷的 `order` MUST 在变更后归一为从 0 起的连续整数。删除卷 MUST NOT 删除任何章节或正文。

#### Scenario: 新建卷

- **WHEN** 用户输入非空卷名并创建卷
- **THEN** 新卷追加到所有正式卷末尾
- **AND** 系统通过现有整本 Novel 保存链持久化该卷

#### Scenario: 重命名卷

- **WHEN** 用户将卷标题修改为去除首尾空白后仍非空的文本
- **THEN** 系统更新卷标题和更新时间
- **AND** 分组导航立即显示新标题

#### Scenario: 调整卷顺序

- **WHEN** 用户上移或下移一个非边界卷
- **THEN** 该卷与相邻卷交换顺序
- **AND** 所有卷的 order 归一为连续整数
- **AND** 章节展开顺序立即跟随新卷序

#### Scenario: 安全删除非空卷

- **WHEN** 用户确认删除一个包含章节的卷

```

Full source: openspec/changes/add-novel-volume-structure/specs/novel-volume-structure/spec.md
