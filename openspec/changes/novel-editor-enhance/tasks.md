## 1. 撤销/重做历史栈（chapter-undo-history）

- [x] 1.1 抽一个纯模块做历史栈：维护 content 快照序列 + 当前指针，提供 push（新增一步）、undo（指针回退返回上一快照）、redo（指针前进）、reset（切章清空并以新章 content 为基线）。栈深设上限（超限丢最旧）；连续手动打字用 debounce/空闲合并，避免逐字符一条历史。纯函数或 hook，无 IO、可独立自检。
- [x] 1.2 在 `ChapterWorkbench.tsx` 接入历史栈，精确区分 content 变更来源：手动 `onChange` 编辑 → push 进栈；AI 续写写回 / 流式逐字 delta / 撤销重做自身触发的写入 → 标记为非手动、不 push；切章 → reset 以新章 content 为基线。用一个"变更来源标记"机制（如写入前置标志位）辨别，勿依赖内容 diff 猜测。
- [x] 1.3 键盘绑定：在正文 textarea 上接管 Ctrl+Z（undo）/ Ctrl+Y 或 Ctrl+Shift+Z（redo），preventDefault 阻止浏览器原生 undo，改用自建栈；undo/redo 后经 `onUpdateChapter` 落库并恢复光标/选区到合理位置。
- [x] 1.4 与既有链共存：撤销栈操作不破坏 AI busy gate、流式订阅（requestId 匹配）、自动保存（600ms debounce）；生成中/busy 时的 undo 行为按 design 定（禁用或允许，需明确）。

## 2. 章内查找替换（chapter-find-replace）

- [x] 2.1 抽查找纯函数：给定当前章 content + 关键词，返回所有命中的字符区间（offset + length）。空关键词返回空；大小写敏感/不敏感由实现定并在 spec 场景体现。可独立自检。
- [x] 2.2 查找替换 UI：查找输入框 + 替换输入框 + 上一个/下一个定位 + 替换当前 + 全部替换；命中计数与当前位置提示；无匹配明确提示。中文文案进独立/小文件，规避大 tsx 幻影字节坑。
- [x] 2.3 定位与替换写入：逐个定位复用现有 `setSelectionRange` + 滚动；替换当前项 = 替换当前命中区间；全部替换 = 一次性替换所有命中。替换写入走 `onUpdateChapter` 落库，并作为**一步**进撤销栈（全部替换 = 单步，可一次 Ctrl+Z 撤销）。

## 3. 验证与验收

- [x] 3.1 `npm.cmd run build` 双端 tsc 通过；文本完整性扫描（`C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py` 扫 src）绿；`git diff --check` 绿。
- [x] 3.2 真机验收覆盖 spec 场景：查找高亮/逐个定位/替换当前/全部替换/无匹配提示；手打多步 Ctrl+Z 逐步回退 + Ctrl+Y 重做；AI 续写写回不被当作可撤销的手动步（按 design 基线语义）；流式生成中逐字不产生逐字历史；切章后撤销栈清空不撤到别章；全部替换后 Ctrl+Z 一次性撤销该替换。
- [x] 3.3 清理临时 QA 数据/进程；按 tasks 逐项验收后单个 commit（分支 `codex/novel-editor-enhance`）。
