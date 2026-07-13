## Why

正文编辑器目前是裸受控 `textarea`，长篇写作缺两件基础能力：一是**没有章内查找替换**，改一个反复出现的词只能手动逐处找；二是**多步撤销不可靠**——正文是受控组件（`value={activeChapter.content}`，每次 `onChange` 用 React state 整体替换 value），这会破坏浏览器原生 undo 栈，Ctrl+Z 行为不可预期。本 change 补齐单章查找替换 + 自建可靠的撤销/重做，纯前端、不改 schema、不加依赖。

## What Changes

- **章内查找替换**：为当前激活章节正文提供查找（关键词高亮/逐个定位）与替换（替换当前项 / 全部替换）。作用范围仅当前章 `content`，不跨章。复用现有 `setSelectionRange` 定位能力。
- **多步撤销/重做**：自建历史栈接管正文编辑的撤销/重做（Ctrl+Z / Ctrl+Y），解决受控 textarea 破坏原生 undo 的问题。**进栈来源**：手动打字编辑 + 查找替换的写入。**不进栈**：AI 续写写回、流式逐字 delta、撤销/重做自身触发的写入。**切章清栈**：历史不跨章串。
- 查找替换与撤销/重做后的正文变更走现有 `onUpdateChapter` → 自动保存链，无新增 IPC、不改 schema。

## Capabilities

### New Capabilities
- `chapter-find-replace`: 当前章正文的查找与替换——关键词查找/高亮/逐个定位、替换当前项、全部替换，仅作用当前章 content。
- `chapter-undo-history`: 正文编辑的多步撤销/重做——自建历史栈，手动编辑与查找替换写入进栈，AI写回/流式/切章不进栈，切章清栈。

### Modified Capabilities
<!-- 无。现有 openspec/specs/ 为 ai-workflow-governance、pinned-ai-context、chapter-search、chapter-reorder，均与本 change 无关；不涉及其 spec 级需求变更。 -->

## Impact

- **Schema**：不变。不改 `Novel`/`Chapter` 接口，不动 version，不加字段、不加依赖。查找替换与撤销栈均为编辑器内部会话态，不落库。
- **持久化**：查找替换/撤销/重做产生的正文变更复用现有 `onUpdateChapter` → `saveNovel`（600ms debounce 自动保存），无新增 IPC 通道。
- **UI（高风险文件）**：全程在 `ChapterWorkbench.tsx`（1229 行）动核心正文 content 流——加查找替换面板、加撤销栈逻辑、接管键盘绑定。属幻影字节高风险区，改动走 Grep 定位 + Edit 锚 ASCII，中文文案进独立/小文件。
- **content 变更来源辨别（核心风险）**：撤销栈"仅手动编辑 + 查找替换进栈"要求精确区分 content 变更来源——手动 onChange 进栈；AI 续写写回、流式 delta、撤销/重做自身写入不进栈；切章清栈。这是本包最易出错处，需与现有 AI busy gate、流式订阅、切章链正确共存。
- **不涉及**：新依赖、schema/IPC/导出协议变更、跨章批量替换、正则查找、协同编辑、卷/场景层级。
