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
3. 章节保留既有 id、标题、正文、大纲、版本与状态字段。
4. `volumeId` 仅在非空字符串且能匹配已消毒卷 id 时保留，否则置为 `undefined`。
5. 按分组归一章节 `order`；v6 老章节全部保持未分卷，并按原全局 order 保持相对顺序。
6. 输出 `version: 7`。新建小说同时初始化 `volumes: []`。

迁移不自动创建“第一卷”，也不更改章节 id 或正文。加载时完成内存迁移，后续经现有保存链写回 v7。

### D6：卷管理集中在“章节大纲”页，其他位置只做分组导航

“章节大纲”页增加卷管理区与按卷分组的章节列表：

- 新建卷默认追加到正式卷末尾，标题必须去除首尾空白后非空。
- 卷标题支持就地重命名；卷头提供上移、下移和删除按钮。
- 删除卷始终使用现有 `window.confirm` 交互，文案明确显示受影响章节数，并说明章节将移入“未分卷”、正文不会删除。
- 每章提供带标签的卷归属选择控件，可选任一正式卷或“未分卷”，作为跨卷移动的键盘路径。
- 原生拖拽支持卷内换位和拖入其他卷；上移/下移按钮负责当前分组内的键盘重排，分组边界禁用。
- “未分卷”在管理页始终作为最后一个可放置分组显示。

项目“章节内容”页与 `ChapterWorkbench` 左侧章节导航按相同分组展示卷标题和章节，但不重复卷 CRUD。工作台切章、正文定位与 active chapter id 逻辑保持原样。

### D7：搜索章号和所有顺序语义来自统一展开结果

跨章搜索先调用 `orderedChapters(novel)`，再按展开索引生成章号与结果顺序。导出章节标题、前一章 Prompt 上下文、统计中的“第 N 章”、情感曲线和人物图谱输入也使用同一结果。卷标题可作为导航和导出结构标题展示，但搜索字段仍只扫描章节 `title`、`content`、`outline`。

### D8：验证以纯函数边界和双端构建为主

不新增测试依赖。结构纯函数沿用项目现有模块自检模式，至少覆盖：v6 未分卷迁移、正式卷顺序、未分卷末尾、组内归一、跨卷移动、删除卷不删章、搜索章号跟随卷序。交付时运行双端 build、文本完整性扫描和 `git diff --check`；GUI 验收覆盖卷 CRUD、拖拽/键盘路径、重启持久化及导出/搜索/Prompt 顺序一致性。

## Risks / Trade-offs

- **[v7 的组内 order 与旧 v6 全局 order 语义不兼容]** → 不允许直接把已产生跨卷排序的数据交给旧版代码；若需要代码回滚，先按 `orderedChapters` 展开并重写全局 `order`，再移除卷字段。
- **[排序消费者遗漏导致不同界面顺序漂移]** → 以 `orderedChapters(novel)` 为唯一入口，构建前扫描剩余直接全局 order 排序点，并在导出、搜索、Prompt、统计和图谱逐项验收。
- **[删除卷被误解为删除正文]** → 删除前始终确认，展示受影响章节数并明确仅移入“未分卷”；数据层禁止级联删除。
- **[原生拖拽跨分组的目标位置不清晰]** → 每个卷和未分卷区提供明确放置状态；归属选择控件始终可完成同一操作，不把拖拽作为唯一入口。
- **[损坏 volumeId 形成孤儿章节]** → 消毒时只保留能匹配现有卷的 id，其他一律归入未分卷。
- **[大文件 UI 改动引入文本或回归风险]** → 卷结构逻辑和中文文案放入独立小模块，巨型组件只做状态接线和渲染组合；用双端 tsc 与文本完整性扫描兜底。

## Migration Plan

1. 同步 renderer、preload、main 的类型与新建小说默认值。
2. 在 `sanitizeNovel` 和 `normalizeWebNovel` 加入 v7 卷/章节归属消毒及组内 order 归一。
3. 落地纯结构函数并让全部顺序消费者迁移到统一入口。
4. 接入卷管理、章节归属和分组导航 UI，继续使用现有自动保存链。
5. 运行构建、文本扫描、diff 检查和 GUI 场景验收。

回滚代码前必须先把每本 v7 小说按统一卷序展平并重写章节全局 `order`；卷与 `volumeId` 可随后移除，`chapterId` 和正文无需转换。

## Open Questions

无。本 change 的删除确认、章节归卷交互、未分卷位置与 `NovelSummary` 边界均已确定；Scene 层级留给后续独立 change。
