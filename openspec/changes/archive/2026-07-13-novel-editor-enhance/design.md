## Context

正文编辑器是 `ChapterWorkbench.tsx` 里的受控 `textarea`（`value={activeChapter.content}`，`onChange` 走 `onUpdateChapter` 整体替换 React state）。受控模式破坏了浏览器原生 undo 栈，Ctrl+Z 不可靠。同一 content 流上已有多个写入来源：手动打字、AI 续写写回版本、流式逐字 delta、AI 选区优化替换、搜索命中定位（只读不写）。本包要在这条流上叠加「章内查找替换」和「自建撤销/重做栈」，且撤销栈只接受手动编辑 + 查找替换两类写入。全程在 1229 行的高风险 tsx 里改，遵守 Grep+Edit 锚 ASCII 纪律（见 read-corrupts-big-novel-tsx）。

## Goals / Non-Goals

**Goals:**
- 当前章正文的查找（高亮/逐个定位）+ 替换（当前项/全部）。
- 可靠的多步撤销/重做（Ctrl+Z / Ctrl+Y），接管受控 textarea。
- 精确区分 content 变更来源：手动编辑 + 查找替换进栈；AI 写回/流式/撤销重做自身不进栈；切章清栈。

**Non-Goals:**
- 不改 Novel/Chapter schema、不加依赖、不落库（编辑器会话态）。
- 不做跨章批量替换、正则查找、协同编辑。

## Decisions

**决策 1：撤销栈用全量 content 快照 + 指针，不做 diff。**
单章正文规模（几千到上万字）全量快照成本可忽略，diff 复杂且易错。栈结构 `{ snapshots: string[]; pointer: number }`，快照含 content + selection（光标/选区），撤销/重做后恢复光标位置。设栈深上限（如 100 步）防内存膨胀，超限丢最旧。

**决策 2：连续手动打字 debounce 合并进栈，而非每字符一条。**
每次 keystroke 一条历史既无用又撑爆栈。手动 onChange 用短 debounce（如 300ms 停顿或 N 字符）合并为一个历史节点。查找替换的写入立即成栈（一次替换 = 一步可撤销，对齐 PO"替换也进栈"）。

**决策 3：变更来源辨别用「显式来源标记」而非「值对比猜测」。**
不靠比较新旧 content 猜是不是手动改的（不可靠）。而是每个写入路径显式声明来源：
- 手动 textarea onChange → `pushHistory(content, 'manual')`（debounced）
- 查找替换写入 → `pushHistory(content, 'replace')`（立即）
- AI 写回/流式 delta/AI选区优化 → 直接 `onUpdateChapter`，**不调 pushHistory**，并将当前 content 设为新基线（重置栈到单节点，避免撤销跨越 AI 写回）
- 撤销/重做自身 → 用 `isApplyingHistory` ref 门禁，应用历史时置 true，其触发的 onChange 早返回不进栈
- 切章（activeChapterId 变）→ useEffect 清栈，以新章 content 为初始单节点

**决策 4：键盘接管。** textarea 上监听 keydown，Ctrl+Z / Ctrl+Y（含 Ctrl+Shift+Z）时 `preventDefault` 阻止浏览器原生 undo，改走自建栈。非编辑器聚焦时不接管。

**决策 5：查找替换纯函数化，便于自检。** 查找（返回所有命中偏移）、替换全部（返回新 content）抽为无 IO 纯函数，放独立小文件（中文文案随之，规避大 tsx 幻影字节坑）。模块加载即跑 assert 自检。

## Risks / Trade-offs

- [AI 写回后撤销栈基线不同步 → 用户 Ctrl+Z 撤到 AI 写回前的旧内容，困惑] → 决策 3：AI 写回重置栈基线为写回后 content，撤销不跨越 AI 写回。
- [流式逐字 delta 每帧触发 onChange 被当手动 → 逐字历史 + 卡顿] → 流式 delta 走独立写入路径，不经 pushHistory；`isStreaming` 期间禁用撤销栈接收。
- [撤销/重做自身触发 onChange 再次进栈 → 死循环/脏历史] → `isApplyingHistory` ref 门禁，应用历史时的 onChange 早返回。
- [切章时旧章历史残留 → Ctrl+Z 撤到别章内容] → 切章 useEffect 清栈重置。
- [debounce 合并导致最后一段编辑未成栈就切章/AI写回 → 丢一步历史] → 切章/AI写回前 flush pending debounce。
- [高风险 tsx 编辑引入幻影字节] → Grep+Edit 锚 ASCII，tsc + 文本完整性扫描验证。

## Migration Plan

无 schema/数据迁移（纯会话态）。回滚 = 还原 ChapterWorkbench.tsx 改动 + 删新增查找替换纯函数文件。

## Open Questions

- debounce 合并的具体阈值（时间/字符数）实现时定，以手感为准。
- 栈深上限具体值实现时定（默认 100）。
- 查找替换面板的确切 UI 位置（工作台正文区上方 vs 浮层）由实现按现有布局定。
