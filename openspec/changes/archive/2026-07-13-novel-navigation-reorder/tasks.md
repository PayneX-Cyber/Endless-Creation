## 1. 章节重排（chapter-reorder）

- [x] 1.1 抽一个纯函数做 order 归一化重排：给定当前有序章节列表 + 源位置 + 目标位置，返回重写 `order`（0..n-1 连续）后的章节数组。复用现有删除章节的 `sort → map((item,order)=>({...item,order}))` 范式，不改 schema。
- [x] 1.2 在章节列表（`NovelCreation.tsx` 概览「章节大纲」页与「章节内容」页，按 design 定的挂载点）接入上移/下移按钮：首章禁用上移、末章禁用下移；点击后走 1.1 重排 → `updateNovel` → 自动保存。
- [x] 1.3 接入拖拽重排：拖起某章、放到目标位，走同一个 1.1 重排函数落库；提供放置位置视觉指示；拖拽项与上下移共用 order 重写逻辑，避免两套。
- [x] 1.4 可达性：上下移按钮有 aria-label；拖拽项可键盘聚焦并有等价操作路径（上下移按钮即为键盘等价入口）。

## 2. 跨章全文搜索（chapter-search）

- [x] 2.1 抽一个纯函数做搜索：给定小说 + 关键词，扫描每章 `title`/`content`/`outline`，返回命中列表（章 id、章号、标题、命中字段、命中字符偏移、摘要片段）。空关键词返回空；大小写不敏感由实现定并在 spec 场景体现。
- [x] 2.2 搜索 UI：输入框 + 结果列表（章号 + 标题 + 摘要片段，高亮命中）。无命中给明确空态提示。中文文案进独立/小文件，规避大 tsx 幻影字节坑。
- [x] 2.3 点击结果切到该章（复用现有 `setActiveChapterId` / 章节定位链）。

## 3. 搜索命中 → 章内字符定位

- [x] 3.1 `ChapterWorkbench.tsx` 正文 textarea 接收"定位请求"（命中字符偏移），用 textarea ref 执行 `setSelectionRange(start,end)` + 聚焦 + 滚动到命中处。用现有 `textareaRef` 与 selection 记录机制对接，不新建第二套 ref。
- [x] 3.2 命中偏移从搜索结果传到工作台的通路打通（切章 + 携带定位目标）；切章后 textarea 已挂载时可靠定位，未挂载时的时序用现有 setTimeout/scrollIntoView 模式对齐。
- [x] 3.3 若原生 textarea 无法可靠定位（切章时序/大文本滚动失效等），先修根因；确认原生能力不足才回决策点，不预先降级为仅切章。

## 4. 验证与验收

- [x] 4.1 `npm.cmd run build` 双端 tsc 通过；文本完整性扫描（`C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py` 扫 src）绿；`git diff --check` 绿。
- [x] 4.2 真机验收覆盖 spec 场景：搜索命中列表/摘要/空态、点结果切章 + 正文选中定位、上移/下移边界禁用、拖拽重排、重排后 order 归一且导出/前文上下文/统计跟随新顺序、重开保留新顺序。
- [x] 4.3 清理临时 QA 数据/进程；按 tasks 逐项验收后单个 commit（分支 `codex/novel-navigation-reorder`）。
