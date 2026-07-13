## Context

长篇小说写到几十章后，两类操作缺失导致导航/结构调整成本高：跨章找一段话只能逐章翻，调整章节顺序则完全没有 UI 入口。当前 `Chapter` 用 `order: number` 字段排序，所有消费者（`NovelCreation`/`novelExport`/`novelPrompts` 前文上下文/`NovelStats`/`EmotionArcPanel`/`characterGraph`）都以 `[...chapters].sort((a,b)=>a.order-b.order)` 派生有序列表。删除章节时已有成熟的 order 归一化范式（`filter → sort → map((item,order)=>({...item,order}))`）。正文编辑器是 `ChapterWorkbench.tsx` 里的受控 `textarea`，已持有 `textareaRef` 并在选区优化里用过 `setSelectionRange`。

约束：不改 `Novel`/`Chapter` schema、不加依赖、纯前端。两处主要改动文件（`NovelCreation.tsx` 1233 行、`ChapterWorkbench.tsx` 1229 行）属幻影字节高风险区，改动须走 Grep 定位 + Edit 锚 ASCII，中文文案进独立/小文件。

## Goals / Non-Goals

**Goals:**
- 跨章全文搜索：扫 `title`+`content`+`outline`，返回命中章节 + 摘要片段，点击切章并在正文 textarea 定位到命中字符位置（选中 + 滚动）。
- 章节重排：拖拽 + 上/下移双入口，统一重写 `order` 并自动保存；order 消费者自动跟随。

**Non-Goals:**
- 不改 schema/version/IPC/导出协议，不加依赖。
- 不搜设定/伏笔（有独立面板）。
- 不做正文查找替换、多步撤销（留下一包）。
- 不做卷/场景层级。

## Decisions

**D1. 搜索为纯客户端内存扫描，无落库、无 AI。**
在内存中对当前 `novel.chapters` 遍历，大小写不敏感匹配 `title`/`content`/`outline`。命中生成摘要片段（命中位置前后若干字符 + 省略号）。理由：数据已全在内存（本地优先），无需 IPC/索引/向量；几十万字量级的线性扫描在输入去抖后开销可忽略。抽为纯函数便于自检（照 `assertPinnedContextSelfCheck` 模式）。

**D2. 搜索结果携带 `{chapterId, field, matchOffset, snippet}`，定位偏移仅对 content 生效。**
点击结果 → 先切到该章（设 `activeChapterId`）→ 若命中在 `content`，把 `matchOffset` 传入 `ChapterWorkbench`，由其在 `textareaRef` 上 `focus()` + `setSelectionRange(offset, offset+len)`，并将光标滚入视口。命中在 title/outline 时只切章、不定位正文。理由：title/outline 不在主 textarea 里，强行定位无意义。

**D3. 定位跨组件传参用一个 pending-locate 信号，不塞进持久状态。**
搜索结果点击时，父组件 `NovelCreation` 设一个会话态 `pendingLocate: {chapterId, offset, length}`，切章后传给 `ChapterWorkbench`；后者用 `useEffect` 消费一次即清（避免重渲染反复跳选区）。理由：定位是一次性动作，不该落库、不该在每次 render 重放。命中字符位置遇原生 textarea 无法可靠定位时先修根因（如等待切章后 ref 就绪、用 `requestAnimationFrame` 等布局），不预先降级为仅切章。

**D4. 重排复用删除章节的 order 归一化范式，拖拽与上下移共用同一个纯重排函数。**
定义 `reorderChapters(chapters, fromIndex, toIndex) → 重写 order 的新数组`（纯函数，内部 sort→splice→map 重写 order）。上移/下移 = `reorder(i, i-1)`/`reorder(i, i+1)`；拖拽 = `reorder(dragIndex, dropIndex)`。结果走 `updateNovel`（= 现有 saveNovel 自动保存链）。理由：单一事实来源，两种交互零逻辑分叉；order 消费者因归一化后连续自动跟随。

**D5. 拖拽用原生 HTML5 draggable，不引依赖。**
列表项 `draggable` + `onDragStart/onDragOver/onDrop`，配放置指示线。上下移按钮作为可达性兜底（首章禁用上移、末章禁用下移），按钮带 `aria-label`。理由：不加拖拽库符合"不加依赖"约束；按钮入口保证键盘/无拖拽场景可用。

**D6. 重排入口挂"章节大纲"页（概览页 outline tab）。**
该页已是章节的结构化列表（含状态选择、删除按钮），是调结构的自然场所；"章节内容"页聚焦逐章正文，不放重排。搜索入口挂概览页顶部（跨章导航属概览职责）。

## Risks / Trade-offs

- **[章内字符定位在原生 textarea 不稳]** → 切章后 textarea 重新挂载/内容变更可能使 `setSelectionRange` 早于内容就绪。缓解：pendingLocate 用 `useEffect` 依赖 `activeChapterId` + 内容，必要时 `requestAnimationFrame` 等布局；按 PO 纪律先修根因，仅在确认原生能力无法可靠定位时才回决策点降级。
- **[改两个 1200 行巨型 tsx 的幻影字节坑]** → 只用 Grep 定位 + Edit 锚 ASCII-only 行，中文文案落独立/小文件，tsc + 文本完整性脚本双验。
- **[拖拽可达性]** → 纯拖拽对键盘用户不可用，故强制配上下移按钮双入口。
- **[order 消费者遗漏]** → 已 grep 全部 order 读点（export/prompt/stats/emotion/graph），均走 sort，归一化后自动跟随；重排后验收需实测导出与前文上下文顺序。
- **[搜索大文本性能]** → 输入去抖（复用现有 debounce 习惯），线性扫描；几十万字下可接受，暂不做索引。

## Migration Plan

无 schema 迁移（不动 schema）。纯增量 UI + 纯函数，无数据格式变更，无需回滚数据。
