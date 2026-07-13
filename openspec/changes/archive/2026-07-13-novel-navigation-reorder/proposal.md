## Why

长篇写作到几十章规模后，两件事变得很痛：一是"想找某段话在哪一章"只能逐章点开翻，模块目前**完全没有跨章正文搜索**；二是想调整章节顺序（把某章挪前/挪后）做不到——现有 UI 只有新增/删除章节，没有重排入口，靠 `order` 字段排序但用户无法改动它。本 change 补齐这两件长篇作者的日常导航/结构工具，纯前端、不改 schema、不加依赖。

## What Changes

- **跨章全文搜索**：新增搜索入口，按关键词扫描当前小说所有章节的 `title` + `content` + `outline`，列出命中章节（章号、标题、命中摘要片段）。点击结果切到该章，并在正文编辑器（textarea）中滚动到命中位置并选中命中文本。
- **章节重排**：为章节列表提供拖拽 + 上移/下移按钮双入口，调整顺序后统一重写所有章节的 `order` 字段（复用现有删除章节时的 order 归一化范式）并经现有链自动保存。重排后所有 `order` 消费者（导出、前文上下文 prompt、统计、图谱）自动跟随新顺序，无需各自改动。
- 搜索为纯读操作，无落库；重排走现有 `updateNovel` → `saveNovel` 自动保存，无新增 IPC。

## Capabilities

### New Capabilities
- `chapter-search`: 跨章全文搜索——按关键词扫描 title/content/outline，返回命中章节与摘要片段，点击结果切章并在正文中定位到命中字符位置。
- `chapter-reorder`: 章节重排——拖拽与上下移双入口调整章节顺序，统一重写 order 并自动保存，order 消费者自动跟随。

### Modified Capabilities
<!-- 无。现有 openspec/specs/ 为 ai-workflow-governance 与 pinned-ai-context，均与本 change 无关；不涉及其 spec 级需求变更。 -->

## Impact

- **Schema**：不变。不改 `Novel`/`Chapter` 接口，不动 version，不加字段。重排只重写既有 `order` 值，搜索不落库。
- **持久化**：重排复用现有 `updateNovel`/`saveNovel`（temp→rename 原子写 + 600ms debounce），无新增 IPC 通道。
- **UI（高风险文件）**：
  - `NovelCreation.tsx`（1233 行）：章节列表渲染处加重排交互（拖拽 + 上下移），加搜索入口/结果面板。
  - `ChapterWorkbench.tsx`（1229 行）：正文 textarea 接收"定位到命中字符位置"（`setSelectionRange` + 滚动），需从搜索结果传入命中偏移。
  - 两文件均属幻影字节高风险区，改动走 Grep 定位 + Edit 锚 ASCII，中文文案进独立/小文件。
- **order 消费者**：`novelExport.ts`、`novelPrompts.ts`（前文上下文）、`NovelStats.tsx`、`EmotionArcPanel.tsx`、`characterGraph.ts` 均读 `order` 排序，重排后自动跟随，无需改动。
- **不涉及**：新依赖、schema/IPC/导出协议变更、正文编辑器查找替换/多步撤销（留下一包）、卷/场景层级、搜索设定/伏笔。
