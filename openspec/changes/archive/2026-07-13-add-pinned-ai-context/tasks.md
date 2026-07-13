## 1. 数据层：schema 扩展与 v4→5 迁移

- [x] 1.1 三份 `Novel` 接口副本（`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`）同步新增 `pinnedSettingIds?: string[]` 与 `pinnedForeshadowingIds?: string[]`，`version` 字面量 `4` 改为 `5`。
- [x] 1.2 在 `electron/main/index.ts` 的小说加载/迁移路径补 v4→5 迁移：老小说加载时两字段默认补空数组，其余字段零改动、不丢数据；迁移幂等（v5 再加载不重复处理）。
- [x] 1.3 确认钉选状态走现有 `saveNovel`（temp→rename 原子写 + 按 id 串行队列）持久化，无新增 IPC 通道。

## 2. 注入层：固定上下文进 prompt

- [x] 2.1 在 `novelPrompts.ts` 增一个纯函数，从 `novel` + 钉选 id 列表解析出当前存在的设定/伏笔（悬空 id 过滤跳过），组装为"固定上下文"文本段（含来源标注，受硬上限约束）。
- [x] 2.2 `buildChapterFromOutlinePrompt`（续写）与 `buildChapterConsistencyPrompt`（一致性检查）接入固定上下文段；review/rhythm/optimize 三处不改。零钉选或全部悬空时，prompt 与改动前等价（不产生空段）。

## 3. UI 层：钉选交互与上限

- [x] 3.1 在设定/伏笔面板（`SettingPanel.tsx` / `ForeshadowingPanel.tsx`，按 design 定的入口）加钉选/取消钉选交互，钉选态可见；勾选变更走 `onUpdateChapterAndSave` 等价的落库路径。
- [x] 3.2 实现钉选硬上限（默认 8，设定+伏笔合计）：达上限时禁用继续钉选并给出提示；取消钉选后可再钉。

## 4. 验证与验收

- [x] 4.1 `npm.cmd run build` 双端 tsc 通过；文本完整性扫描（`.codex/skills/endless-creation-guardrails/scripts/scan_text_integrity.py`）绿；`git diff --check` 绿。
- [x] 4.2 真机验收覆盖 spec 场景：钉选注入续写/一致性可见于 prompt 构造、关项目重开钉选保留、删除已钉条目不报错跳过、v4 老小说迁移到 v5 不丢数据、达上限禁用提示。
- [x] 4.3 清理临时 QA 数据/脚本/进程；按 `review_mode` 与 tasks 逐项验收后单个 commit。
