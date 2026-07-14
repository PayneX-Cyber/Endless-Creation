---
comet_change: add-novel-volume-structure
role: technical-design
canonical_spec: openspec
---

# add-novel-volume-structure 技术设计

本文档是对 OpenSpec open 阶段 `design.md`（D1-D8 高层框架）的深度技术细化。canonical spec 以 OpenSpec delta spec 为准；本文只补充实现级设计、技术风险、边界条件与测试策略，不重写需求。

## 背景约束

现有小说 schema 为 version 6，`Novel.chapters[]` 为唯一扁平章节集合，`Chapter.order` 表示全局顺序。导航、跨章搜索、导出、Prompt 前文上下文、统计、情感曲线、人物图谱各自按 `order` 排序，无统一顺序入口。主进程 `sanitizeNovel` 是 Electron 加载/保存消毒入口，Web 预览另有 `normalizeWebNovel`；renderer 经 `updateNovel` → 600ms 自动保存 → `saveNovel(novel)` 整体持久化。

本 change 在**保持章节扁平存储**的前提下引入卷元数据。硬边界：`chapterId`、`chapter.content`、伏笔引用、情感曲线点、分析持久化锚点均不变；不新增 IPC、不新增依赖、不改 `NovelSummary`；为后续 Scene 层级（change 2）保留清晰边界。

## 已确认技术决策

### T1：章序契约（单一事实源）

`orderedChapters(novel): Chapter[]` 是全书章节顺序的**唯一权威来源**，返回按卷序展开的纯 `Chapter[]`，不原地修改 Novel。

铁律：

- **全局章号 = 该章在 `orderedChapters` 结果中的 `index + 1`**。禁止再用 `chapter.order + 1` 表示全书章号。
- **前后关系 / 前文筛选 = 对 `orderedChapters` 结果切片**（前文上下文 = `ordered.slice(0, currentIndex)`）。禁止再用 `chapter.order < currentChapter.order` 判断先后。
- `chapter.order` 降级为**纯组内排序键**（每分组从 0 连续），仅在展开函数内部消费，不对外表达全书语义。
- 拒绝 `{chapter, globalIndex}[]` 包装方案：globalIndex 已隐含在有序数组位置，包装是重复状态、额外的不同步来源。

展开规则：正式卷按 `Volume.order` 升序 → 各卷内按 `Chapter.order` 升序 → 未分卷（`volumeId` 为空或无法匹配现有卷）按自身 `Chapter.order` 升序，**恒定排在所有正式卷之后**。排序相同时以原数组位置作稳定兜底，保证损坏/旧数据结果确定。

已实证的消费点改造映射（Grep 定位）：

| 位置 | 现状 | 改造 |
|------|------|------|
| `novelExport.ts:118` | `第 ${chapter.order+1} 章`（HTML 导出） | `orderedChapters` 展开后取 `index+1` |
| `novelExport.ts:146` | `第 ${chapter.order+1} 章`（md 导出） | 同上 |
| `novelExport.ts:103/141` | `novel.chapters.slice().sort(order)` | 改用 `orderedChapters(novel)` |
| `novelPrompts.ts:448` | `novel.chapters.map((item,index)=>index+1)` 章号 map | index 来源换成 `orderedChapters` |
| `novelPrompts.ts:539` | `order < currentChapter.order ... sort` 前文筛选 | `ordered.slice(0, currentIndex)` |
| `characterGraph.ts:46` | `novel.chapters.map(...)` 拼接（无序依赖） | 与顺序无关，D3 豁免，不强改（如需稳定输出可选接入） |
| `emotionArc.ts:30` | `new Set(chapters.map(id))` 建集 | 与顺序无关，不改 |

### T2：结构调整不中断编辑会话

删除卷、卷排序、章节归卷/移出/跨卷移动等纯结构操作，只改 `volumeId` 与 `order`，`activeChapterId` 恒定保持。正文、光标、编辑器撤销/重做历史栈、保存状态均不因结构调整重置。删卷后被移入未分卷的激活章节仍是同一 `chapterId`，编辑不中断。

**技术风险点（实现时验收）**：`ChapterWorkbench.tsx` 有自建撤销/重做历史栈，**切章会清栈**（见 [[novel-editor-enhance-status]] 记录）。纯结构操作**不等于切章**，MUST NOT 触发切章清栈路径。实现时须确认结构变更只更新 `volumes`/`volumeId`/`order` 状态，不改变 `activeChapterId` 引用，从而不进入切章副作用。

### T3：拖拽是增强，键盘路径是保证

用 HTML5 原生 `draggable` / `onDragStart` / `onDragOver` / `onDrop` 实现卷内换位与跨卷拖入，**零新增依赖**。所有结构操作 MUST 能仅通过键盘路径完成：上下移按钮做卷内重排（分组边界禁用），带 aria-label 的卷归属选择控件做跨卷移动。拖拽不可用（触屏、辅助技术）时功能不缺失。三种入口（拖拽 / 上下移按钮 / 归属控件）共用同一组结构变更纯函数，不得出现两套 order 语义。每个卷区与未分卷区提供明确放置目标视觉反馈。

### T4：模块边界（瘦身原则）

- **`src/features/novel-creation/novelStructure.ts`**（纯 .ts，无 React 依赖，ASCII 友好，tsc 可独立验证）：承载全部纯数据函数。
  - `orderedChapters(novel): Chapter[]`
  - `groupChaptersByVolume(novel): { volume: Volume | null; chapters: Chapter[] }[]`（`volume: null` 为未分卷分组，恒定末位）
  - `moveChapterInStructure(novel, chapterId, target): Novel`（卷内重排 + 跨卷移动 + 归属更新 + 源/目标分组 order 归一）
  - `reorderVolumes(novel, volumeId, direction): Novel`
  - `deleteVolume(novel, volumeId): Novel`（清空相关章节 `volumeId`，不删章）
  - `createVolume` / `renameVolume` / 卷 order 归一辅助
  - 所有函数返回新 `Novel`，不原地修改。
- **一个 UI 组件 `VolumeOutline.tsx`**：承接卷管理头部（新建/重命名/上下移/删除确认）+ 按卷分组的章节列表 + 拖拽/键盘交互。不再拆一串小组件。
- 中文文案放该 UI 文件内或独立 labels 文件；**巨型 `NovelCreation.tsx` 只做状态接线和回调传递**，不写卷逻辑。
- **`ChapterWorkbench.tsx` 左栏导航改为只读卷分组展示**（不含卷 CRUD），复用 `groupChaptersByVolume` 结果，维持 active chapter / 搜索定位 / 生成中 busy gate / 正文编辑流程。

依据：项目现有约定"纯逻辑 .ts + 组件 .tsx"（`emotionArc.ts` vs `EmotionArcPanel.tsx`）；把复杂逻辑关进纯 .ts、巨型 tsx 只碰最小状态接线，规避大 tsx Read 渲染幻影字节风险（见 [[read-corrupts-big-novel-tsx]]）。

## 数据模型

```ts
interface Volume {
  id: string;
  title: string;
  order: number;      // 卷序，归一为 0..n-1
  createdAt: string;
  updatedAt: string;
}

interface Chapter {
  // 既有字段全部保持不变
  volumeId?: string;  // 新增：归属卷 id；空或不匹配 = 未分卷
}

interface Novel {
  volumes: Volume[];  // 新增
  chapters: Chapter[]; // 仍扁平，不嵌套
  version: 7;         // 6 → 7
}
```

`NovelSummary` 不变，不加 `volumeCount`。

## 迁移与消毒（Electron + Web 双端同义）

主进程 `sanitizeNovel` 与 renderer `normalizeWebNovel` 都升级为 version 7，语义一致：

1. `volumes` 缺失 / 非数组 → 归一为 `[]`。
2. 卷条目逐项校验：非法条目丢弃；合法条目补齐 `id`（缺失则 `randomUUID`）、时间戳、并归一 `order` 为 `0..n-1`。
3. 章节保留既有 id / title / content / outline / versions / status 等全部字段。
4. `volumeId` 仅在**非空字符串且能匹配已消毒卷 id** 时保留，否则置 `undefined`（孤儿归未分卷）。
5. 按分组归一章节 `order`；**v6 老章节全部保持未分卷，并按原全局 order 保持相对顺序**。
6. 输出 `version: 7`。`createNovel` 同时初始化 `volumes: []`。

迁移不自动创建"第一卷"，不改章节 id 或正文。加载时完成内存迁移，后续经现有保存链写回 v7。

## 持久化

卷 CRUD、卷排序、归卷、重排全部经 `novelStructure.ts` 纯函数生成新 `Novel` → 现有 `updateNovel` → 600ms 自动保存 → `saveNovel`。不新增 `createVolume` / `moveChapterToVolume` 等 IPC。Electron 保存仍用临时文件 rename 原子替换；Web 预览写 localStorage fallback。每次结构变更刷新相关对象 `updatedAt`。

## 边界条件

- 损坏 / 缺失 `volumes` → 空卷数组，小说仍可加载编辑。
- 孤儿 `volumeId`（引用已删卷）→ 归未分卷。
- 空卷（无章节）→ 允许存在，展开时不产生章节。
- 删除当前激活章节所在卷 → 章节移入未分卷，`activeChapterId` 保持，编辑不中断（T2）。
- 跨卷移动当前激活章节 → 同上，仅归属与 order 变。
- 卷/章节 order 相同 → 原数组位置稳定兜底。

## 风险与取舍

- **排序消费者遗漏导致界面顺序漂移** → `orderedChapters` 唯一入口；构建前扫描残留直接全局 order 排序点（已实证 novelExport / novelPrompts 两处两套章号语义），导出/搜索/Prompt/统计/图谱逐项 GUI 验收。
- **纯结构操作误触发切章清栈** → 明确区分"结构调整"与"切章"；结构变更不改 `activeChapterId`。
- **v7 组内 order 与 v6 全局 order 语义不兼容** → 不允许把已产生跨卷排序的数据交给旧代码；代码回滚前先按 `orderedChapters` 展平并重写全局 order，再移除卷字段（`chapterId`/正文无需转换）。
- **原生拖拽跨分组落点不清晰** → 每个卷/未分卷区提供明确放置状态；归属控件始终可完成同一操作，拖拽非唯一入口。
- **大 tsx 文本/回归风险** → 卷逻辑与中文文案入独立小模块，巨型组件只做状态接线；双端 tsc + 文本完整性扫描兜底。

## 测试策略

- **结构纯函数自检**（沿用项目现有模块自检模式，不新增测试依赖）：v6 未分卷迁移、正式卷顺序、未分卷末尾、组内 order 归一、跨卷移动双侧归一、删除卷不删章、无效 volumeId 降级、章号跟随卷序。
- **交付验证**：`npm.cmd run build`（renderer tsc+Vite / Electron tsc 均 exit 0）；文本完整性扫描得 `TEXT INTEGRITY OK`；`git diff --check` 无空白错误。
- **GUI 真机验收**：卷 CRUD / 确认删除、卷排序、归卷 / 移出 / 跨卷、拖拽+键盘双路径、未分卷末尾、重启持久化、搜索章号、导出 / Prompt / 统计 / 图谱顺序一致、结构调整不中断编辑会话（T2 两个 Spec Patch 场景）。

## Spec Patch（已回写 delta spec）

已在 `specs/novel-volume-structure/spec.md` 的 ADDED Requirements 新增 1 个 Requirement + 2 个 Scenario：**「纯结构调整不中断编辑会话」**（归卷/跨卷移动保持编辑会话、删激活章所在卷后继续编辑）。其余 3 份 delta spec（novel-volume-structure 其余部分 / chapter-reorder / chapter-search）场景已完整，不改动。Spec Patch 仅补验收场景，不改结构范围。

## 非目标（change 2 边界）

- 不新增 Scene 层级，不把正文从 `Chapter.content` 下沉。
- 不改任何基于 `chapterId` 的业务引用。
- 不新增卷专用 IPC / 数据库 / 索引 / 第三方拖拽依赖。
- 不为 `NovelSummary` 加 `volumeCount`。
- 不实现 v7→v8 或完整四级结构。
