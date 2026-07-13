# 验证报告：add-pinned-ai-context

- 日期：2026-07-13
- 模式：full（scale=full：22 变更文件 > 8 阈值触发；其中 13 为 openspec 规划产物，真实源码 9 文件、单 capability、单模块）
- commit：46ce5e8 feat: add pinned AI context
- base_ref：18c66cb
- review_mode：off（跳过自动 code review；本报告以 full spec 覆盖核验替代，逐条对照真实字节）

## 摘要

| 维度 | 结果 |
|------|------|
| Completeness | tasks 10/10 完成；1 capability / 5 requirement 全部有实现证据 |
| Correctness | 12/12 scenario 有真实代码字节支撑；运行时自检 4 项通过 |
| Coherence | 符合 design 决策（schema 进 Novel、注入纯函数化、悬空过滤在注入层、上限在 UI/toggle 层）；注入范围精确合规 |

## 验证证据（本次新鲜运行）

### 构建 / 静态
- `npm.cmd run build`：双端通过（renderer vite built in 572ms + electron tsc exit 0）
- `git diff --check`：clean
- 权威文本完整性扫描（`C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py`）：TEXT INTEGRITY OK；U+FFFD grep 改动文件 clean。

### 运行时自检（node 单跑 buildPinnedContext 逻辑）
- 悬空 id 跳过：true
- 设定注入：true
- 伏笔注入：true
- 空钉选返回空串：true
- 上限截断到 8 行：true（got 8）
- 模块加载自检 `assertPinnedContextSelfCheck()` 通过（不抛错）

## Spec 场景逐条核对（12/12）

| Requirement / Scenario | 证据 |
|------|------|
| 钉选/取消设定 | NovelCreation.tsx:735 togglePinnedSetting → updateNovel 链落库 |
| 钉选/取消伏笔 | NovelCreation.tsx:793 / ChapterWorkbench.tsx:765 togglePinnedForeshadowing → onUpdateNovel 链落库 |
| 硬上限 8（设定+伏笔合计） | toggle 内 `ids.length + 对侧长度 >= PINNED_CONTEXT_LIMIT` 拦截；面板 pinLimitReached 禁用 + 提示文案 |
| 达上限恢复可钉 | 取消走 filter 移除，pinLimitReached 重算 |
| 续写注入 | novelPrompts.ts:126 buildChapterFromOutlinePrompt；generateChapterBody(ChapterWorkbench:350) 走此入口 |
| 一致性注入 | novelPrompts.ts:327 buildChapterConsistencyPrompt |
| review/rhythm/optimize 不注入 | buildPinnedContext 仅 3 处调用（自检+续写+一致性）；review(303)/rhythm(354)/optimize(378) 零注入 |
| 无钉选行为等价 | 空 pinnedContext 返回 ''，注入点 `.filter(Boolean).join('\n')` 剔除空段 |
| 悬空引用容错 | buildPinnedContext 用 Map.get + filter(undefined) 跳过失效 id，不报错 |
| 钉选跨会话保留 | toggle 走 updateNovel/onUpdateNovel（= 现有 saveNovel debounce 落库链） |
| v4→5 迁移 | sanitizeNovel 加载即消毒：pinnedXxxIds 补空数组、version 强制 5、sanitizeStringIds 去重去空 |
| 迁移不丢数据 | sanitizeNovel 仅新增两字段，chapters/settings/foreshadowings 原样保留 |

## Schema 四副本同步核对
- src/types/novel.ts、electron/preload/bridgeTypes.ts、electron/main/index.ts、src/services/rendererBridge.ts 均新增两字段 + version 5，一致。

## 结论

无 CRITICAL、无 IMPORTANT、无 WARNING。全部检查通过，ready for archive。

## GUI 真机验收

PO 已完成 GUI 真机验收：钉选状态重开后保留、续写实际带入钉选上下文、删除已钉选设定后悬空引用被跳过、达到 8 条上限后继续钉选被禁用，全部 PASS；验收环境已清理。
