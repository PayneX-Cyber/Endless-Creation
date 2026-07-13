# 验证报告：novel-editor-enhance（full）

日期：2026-07-13
change：novel-editor-enhance（Comet tweak，正文编辑器增强）
commit：6b6ecf9 feat: add novel editor find-replace and undo history
base：b217f0e
分支：codex/novel-editor-enhance

## 验证模式

full（scale 评估：10 任务 > 3、2 capability > 1 触发；源码实际仅 3 文件）。

## Summary

| 维度 | 结果 |
|------|------|
| Completeness | tasks 10/10 已勾；2 capability 15 scenario 全有实现 |
| Correctness | 15 scenario 逐条对照真实字节，全部支撑 |
| Coherence | 复用 onUpdateChapter/setSelectionRange；不改 schema/依赖；来源标记机制清晰 |

## 实际交付（磁盘现读为准）

源文件 3 个（`git show --name-only` 权威）：
- `src/features/novel-creation/novelEditorTools.tsx`（新，撤销栈纯模块 + 查找替换纯函数 + ChapterFindReplace UI + 模块自检，6077 字节）
- `src/features/novel-creation/ChapterWorkbench.tsx`（改，核心 content 流接线）
- `src/features/novel-creation/ChapterWorkbench.css`（改）

注：本会话第三次撞 git 读数幻觉——早先 `git show --stat` 报的 novelEditorHistory.ts/EditorFindReplace.tsx 两文件、agent 报告的文件清单均为幻觉；以磁盘 ls + git show --name-only 为唯一真相，实为单文件合一。

## 新鲜验证证据（本次运行）

- `npm.cmd run build`：双端 tsc + vite 全绿（exit 0）
- 运行时自检（纯逻辑）：多步 undo/redo、redo 分支丢弃、同内容不进栈、栈深上限 100、大小写不敏感查找、replaceAll 无移位错乱（reduceRight）、空查询空数组、栈底 null——全绿
- 文本完整性扫描：TEXT INTEGRITY OK（exit 0）
- git diff --check：干净
- 改动文件无 U+FFFD 幻影字节

## GUI 真机验收

使用真实 Electron 窗口、隔离 `userData` 和本地假 OpenAI 兼容端点执行；未读取或改写用户真实小说/API 配置。

- 查找：大小写不敏感命中 4 处；上一个/下一个正确移动 textarea 选区；空关键词与无匹配状态正确。
- 替换当前：一次 Ctrl+Z 整体撤销，Ctrl+Y 重做。
- 全部替换：4 处一次写入，一次 Ctrl+Z 完整恢复。
- 手动编辑：相隔 350ms 的两次编辑形成两个可用撤销步，多步 Ctrl+Z/Ctrl+Y 正常。
- 切章：切到第二章后 Ctrl+Z 不影响第一章。
- AI 写回：通过历史版本“写回正文”走真实 AI write source；写回后 Ctrl+Z 不恢复写回前正文。
- AI busy：评审请求执行期间查找替换禁用，Ctrl+Z 不生效；请求结束后恢复。
- 默认 Electron 窗口 `1280×820`（renderer `1266×754`）：无页面横向溢出，查找替换区和正文区完整可见。

## 三个 PO 重点项（真实字节核实）

- **AI 写回基线重置**：writeChapterContent 中 `source==='ai' && chapterId===activeChapterId` → resetEditorHistory（重置基线而非进栈）；流式 delta 不走该 push 路径；handleManualContentChange 有 isApplyingHistoryRef 门禁。
- **切章清栈**：useEffect([activeChapterId]) 先 flushManualHistory 再 resetEditorHistory 以新章 content 建单节点基线；A 章历史不带到 B 章。
- **替换原子撤销**：source==='replace' → pushEditorHistory 单次；replaceAll 在纯函数 reduceRight 生成完整 content，单步进栈，一次 Ctrl+Z 整体撤销。
- **防循环**：undo/redo 走 history 分支设 isApplyingHistoryRef=true，rAF 复位；manual change 该标志位下早返回，不 push。
- **键盘**：Ctrl+Z→undo、Ctrl+Y/Ctrl+Shift+Z→redo，preventDefault 接管原生 undo；busy 时 applyHistory 早返回。
- **手动打字合并**：queueManualHistory 350ms debounce，避免逐字符进栈。

## Issues

- CRITICAL：无
- IMPORTANT：无
- 说明（不阻断）：
  1. 较小窗口 `1180×760`（renderer `1166×698`）下工作台既有双栏布局出现横向滚动和右侧裁切；默认窗口无此问题，本 change 未新增响应式范围，记为 WARNING、非本包阻断。
  2. openspec 产物未进 6b6ecf9（agent 限定只提交源文件），归档提交时纳入。

## 结论

full 验证通过，无 CRITICAL/IMPORTANT。代码层 15 scenario 全部有真实字节支撑，GUI 真机核心路径全绿；可进入分支处理与归档。
