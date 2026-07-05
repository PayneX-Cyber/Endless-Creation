# useAiCheck 重构规格（第五阶段技术债）

日期：2026-07-06
类型：纯内部重构（零行为变化、零 schema、零 IPC、零 prompt 文案改动）
文件：仅 `src/features/novel-creation/ChapterWorkbench.tsx`（如需 hook 单独成文，见下方边界）

## 背景

`ChapterWorkbench.tsx` 现约 865 行（本地编辑器计数；git bash `wc -l` 因行尾计为 902）。其中 review（章节评审）、consistency（一致性检查）、rhythm（节奏检查）三个**只读 AI 检查**的状态机几乎逐字复制粘贴：各有一份 `xxxBusy / xxxError / xxxResult` state、一个 `generateChapterXxx(chapter)` 异步函数、一个 `cancelXxx()` 函数，三份结构完全同构，仅 prompt builder、`maxTokens`、错误文案不同。

这是第四阶段收口时登记的技术债，约定"进 5b 前或再加一个只读 AI 检查前抽 `useAiCheck`"。现按 PO 决策 A→B：先还这笔债，再开伏笔记录落库刀。

## 目标

用一个 `useAiCheck` hook 消掉这三份重复，使**新增第 4 个只读检查时只需一行调用**，而不再复制整套状态机。

## 严格边界（不做什么）

- **只抽 review / consistency / rhythm 三个只读检查。** 不碰：选区优化（optimize）、生成大纲（outline）、章节生成（generation）、复制/导出、preview 写回、历史版本。
- **零 schema、零 IPC、零 prompt 文案改动。** `buildChapterReviewPrompt / buildChapterConsistencyPrompt / buildChapterRhythmPrompt` 与各自的 `maxTokens`、错误兜底文案逐字保留。
- **不做 UI 重排。** 按钮位置、loading 行、error 行、result modal 的 JSX 结构与文案不变；只把其数据来源从散 state 换成 hook 返回值。
- **hook 接口不做成万能框架。** 只服务"只读、单章、结果进 modal、可取消、chapterId 门控"这一类检查。不预埋写回、不预埋多参数策略、不为 optimize/outline/generation 通用化。
- **hook 是 ChapterWorkbench 专用局部 hook，不外导。** `useAiCheck` 定义在 `ChapterWorkbench.tsx` 内，**不 export、不进 `index.ts`**。名字/注释显式写明「ChapterWorkbench 专用只读 AI 检查 hook，依赖组件级共享 `runRef`/`requestIdRef`/`cancelGeneration` 语义，勿外用/勿泛化」。放同文件 + 不外导是刻意用物理边界防止它被误当通用 hook 而泛化成万能框架。

## 行为不变清单（验收即回归这些）

以下每条对 review / consistency / rhythm 三者都必须成立，且与重构前逐字一致：

1. **进入守卫**：`if (busy || !chapter.content.trim()) return;` —— busy 是跨所有 AI 操作的聚合值，空正文不触发。
2. **模型就绪**：`ensureTextModel(setError)`（review 用 `(m) => setReviewError(m)`，另两者直接传 setter，保持现状）不就绪则 return。
3. **共享 ref 语义（本次重构最关键钉子）**：
   - `runRef` 与 `requestIdRef` **保持组件级共享**，不进 hook 私有状态。
   - run 时 `runId = runRef.current + 1; runRef.current = runId; requestIdRef.current = requestId`。
   - await 返回后 `if (runRef.current !== runId) return;`（防过期，跨操作生效）。
   - `cancelXxx` 执行 `runRef.current += 1` —— 必须仍能**作废当时在飞的任何其它类型请求**（章节生成/大纲/optimize）。
   - `cancelGeneration`（章节生成取消）必须仍**顺带把三个检查的 busy 置 false**。
   - 若把 setter 收进 hook，这些跨操作重置点要能拿到三个 hook 的 `setBusy`（例如 hook 暴露 `reset()`／`setBusy`，由 cancelGeneration 逐一调用）。
4. **状态清理顺序**：run 开始 `setBusy(true); setError(''); setResult(null)`；await 后 `setBusy(false)`；失败 `setError(result.message || 各自兜底文案)`；成功 `setResult({ chapterId, content: result.text.trim() })`。
5. **切章副作用**：`useEffect([activeChapterId])` 仍重置三个 error（连同 selection / optimizeError），**不动** busy / result。
6. **聚合 busy**：`busy = generatingChapterId!==null || outlineBusy || reviewBusy || consistencyBusy || rhythmBusy || optimizeTypeOpen || optimizeJob!==null`。三个检查 busy 换成 hook 返回值后，这行等价重组，其余项原样保留。
7. **result modal 门控**：`xxxResult && xxxResult.chapterId === activeChapter?.id` 才渲染；"重新检查"按钮 `disabled={busy}`；关闭 `setResult(null)`。

## hook 形态建议（实现可微调，语义不可变）

```ts
// ChapterWorkbench 专用局部 hook——单章只读 AI 检查（评审/一致性/节奏同构）。
// 依赖组件级共享 runRef/requestIdRef 与 cancelGeneration 跨作废语义，勿外导、勿通用化。
function useAiCheck(config: {
  buildMessages: (novel, chapter) => Message[];
  maxTokens: number;
  failMessage: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ chapterId: string; content: string } | null>(null);
  // run(chapter, { novel, ready, runRef, requestIdRef, busy }) → 内部照现状流程
  // cancel({ runRef, requestIdRef }) → 现状流程
  return { busy, error, result, setError, setResult, setBusy, run, cancel };
}
```

- run 的 `busy` 进入守卫、`ready`（ensureTextModel 结果）、共享 `runRef/requestIdRef` 由调用方传入，避免 hook 私建 ref 破坏跨作废。
- 三处调用：`const review = useAiCheck({ buildMessages: buildChapterReviewPrompt, maxTokens: 800, failMessage: '评审失败，请稍后重试。' })` 等。
- `cancelGeneration` 内改为 `review.setBusy(false); consistency.setBusy(false); rhythm.setBusy(false)`。
- JSX 引用从 `reviewBusy → review.busy`、`reviewError → review.error`、`reviewResult → review.result`，逐一替换，不改结构。

## 验收

- **逐项回归三条检查**（review / consistency / rhythm 各跑一遍）：
  1. 空正文点击无反应。
  2. 未配模型点击 → 对应 error 文案。
  3. 正常生成 → loading 行出现 → 结果进对应 modal，内容正确。
  4. 生成中点"取消" → busy 落下、无 modal、无残留 error。
  5. 生成中切到别的章 → 不弹到别章（chapterId 门控）；切回原章 error 已清。
  6. **跨作废**：一个检查生成中，触发章节生成/取消，或章节生成中触发检查取消，验证在飞请求被正确作废、无过期结果写入。
- build 双绿（renderer tsc+vite / electron tsc）。
- 双目录文本完整性扫描 + 坏文案 grep 零命中。
- 完整 diff 原始字节核对：确认未越界改动 optimize/outline/generation/preview/导出/schema/IPC/prompt。
- 数据 hash 不变（重构无落库，任何小说 `novel.json` 不应被本次改动触碰）。

## 后置（不进本刀）

- optimize / outline / generation 的进一步抽象（它们含写回，语义不同，不并入 useAiCheck）。
- AiCheckPanel 组件化（loading/error/modal 的 JSX 抽取）——如本刀后 JSX 仍显重复可另起一刀，本刀只抽状态机。
