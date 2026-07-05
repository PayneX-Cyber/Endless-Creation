# useAiCheck 重构实施计划

规格：`2026-07-06-novel-useaicheck-refactor-spec.md`
范围：仅 `src/features/novel-creation/ChapterWorkbench.tsx`（+ 可选新增 `useAiCheck.ts` 同目录）
性质：纯内部重构，零行为变化。

## Task

- [ ] T1 抽 `useAiCheck` hook（run 进入守卫/ensureTextModel/共享 runRef+requestIdRef 传入/清理顺序/失败文案 参数化；不新建 ref）
- [ ] T2 三处调用替换散 state：review(800)/consistency(1200)/rhythm(1000)，各传对应 prompt builder 与兜底文案
- [ ] T3 改 `cancelGeneration` 与 `cancelXxx`：跨作废 `runRef.current += 1` 语义不变；cancelGeneration 逐一调 hook.setBusy(false)
- [ ] T4 JSX 引用替换（reviewBusy→review.busy 等），聚合 busy 行等价重组，切章 useEffect 三 error 清理不动 busy/result
- [ ] T5 验收：build 双绿 + 双目录文本扫描 + 坏文案 grep + 完整 diff 原始字节核对未越界 + 六项逐条回归（含跨作废）+ 数据 hash 不变

## 硬约束（派单必带）

- ChapterWorkbench.tsx **禁整文件 Read**，必用 grep/awk 取原始字节。
- 只碰 review/consistency/rhythm；不碰 optimize/outline/generation/复制导出/preview/schema/IPC/prompt 文案。
- runRef/requestIdRef 保持组件级共享，不进 hook 私有状态（否则跨作废语义断裂）。
- 不做 UI 重排，JSX 结构/文案不变。
