# 小说创作 4b：选区级针对性优化改写 切片规格

日期：2026-07-04
上位文档：`docs/plans/2026-06-30-novel-creation-migration-plan.md`（第四阶段「评估与优化」）、`docs/plans/2026-07-03-novel-chapter-review-4a-implementation.md`

## 总体结论

4b 是阶段四第二刀，从「只读评估」（4a 章节评审）转向「优化闭环」。

一句话目标：

```text
选中一段正文 → 点「优化选区」→ 选优化类型 → AI 改写 → 原文/改写稿对照 → 确认替换选区
```

阶段四第一刀 4a 证明了「评估链路」（Prompt + 当前小说上下文 + 文本生成接口 + 只读展示）。4b 在此基础上闭合「优化闭环」——让用户看完问题后能直接改正文，而不是只读评审后自己动手。

范围锁定为：**选区级优化 + 三种优化类型 + 原文/改写稿对照 + 确认替换**。整章优化、diff 高亮、多候选、版本化全部后置。

## 一、数据口径

**零 schema 新增，零落库（与 4a 同款约束）。**

- 优化过程**无任何 schema 变更**、无新字段、不写 localStorage。
- AI 改写稿在**确认替换前是纯会话态**：只存组件 state，关闭即丢。
- 确认替换后，`content` 变更走**现有保存链路**（与用户手动编辑正文完全一致的路径），不带任何「这是 AI 改的」标记。
- **不产生 version，不碰 `selectedVersionId`**——4b 是局部替换，不是版本化写回。
- **不做磁盘级防覆盖**（不 loadNovel、不弹整章覆盖确认）。前提是：
  1. 生成期间 textarea `readOnly`，内存 content 不会变；
  2. 全局互斥保证同时只有一个 AI 任务；
  3. 写回前做 `contentSnapshot + selectedText + start/end` 三重内存校验，失败即不写回。
  选区内存校验比 3b 的整章磁盘核对**更精确**（精确到「这段原文有没有变」），叠加磁盘核对反而引入整章级误报，且把不产生版本的 4b 硬塞进版本写回逻辑会污染语义。

## 二、状态设计

全部在 `ChapterWorkbench` 内，不上提父组件。

```ts
type OptimizeType = 'dialogue' | 'environment' | 'psychology';

// onSelect/onKeyUp/onMouseUp 实时记录
selection: { start: number; end: number; text: string } | null

// 合并 job：快照从发起生成时就绑定，取消/失败/成功围绕同一份
optimizeJob: {
  status: 'loading' | 'success';
  chapterId: string;
  contentSnapshot: string;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  type: OptimizeType;
  optimizedText?: string;   // 生成成功时填入
} | null

// 错误单独存（失败时 job 清空）
optimizeError: string

// 类型选择 modal 开关
optimizeTypeOpen: boolean
```

一个 ref：`textareaRef` — 用于替换后 `focus + setSelectionRange`。

**busy 派生，不新增独立 bool**：

```ts
busy = generatingChapterId !== null || outlineBusy || reviewBusy
       || optimizeJob?.status === 'loading'
```

## 三、快照与写回校验

**发起生成时**记录快照到 `optimizeJob`（连同 type）。

**写回前三重校验**：

```text
1. 当前 chapterId === optimizeJob.chapterId
2. 当前 content === optimizeJob.contentSnapshot
3. content.slice(selectionStart, selectionEnd) === selectedText

任一失败：提示「原文范围已变化，请重新选择后生成。」不写回。
```

**写回成功**：

```ts
const nextStart = selectionStart;
const nextEnd = selectionStart + optimizedText.length;
const nextContent =
  content.slice(0, selectionStart) + optimizedText + content.slice(selectionEnd);

onUpdateChapter(chapterId, { content: nextContent });

requestAnimationFrame(() => {
  textareaRef.current?.focus();
  textareaRef.current?.setSelectionRange(nextStart, nextEnd);
});
```

- 用 `requestAnimationFrame`（或 `setTimeout(0)`）等 React 提交后再设选区，否则被重渲染覆盖。
- 替换后自动选中新改写段，让用户看到「哪段被换了」。
- 不做滚动逻辑，`focus + setSelectionRange` 已够用。

## 四、用户流程

入口（仅已完成章节的编辑器，`status === 'done'`，与 4a「章节评审」同级）：

```text
1. 用户在 textarea 里选中一段文字
   → onSelect/onKeyUp/onMouseUp 实时记录 selection

2. 点「优化选区」
   → selection.text.trim() 为空 → 提示「请先选择要优化的正文」→ 停
   → 有效 → **立即将 textarea 转 readOnly**（锁定选区，防止类型 modal 打开期间用户改正文使 selection 坐标漂移）→ 打开类型选择 modal

3. 类型 modal（复用现有 .novel-modal 骨架，非 popover）
   → 顶部显示选中文本预览（前 80 字，复用 brief()）
   → 三个按钮：对话优化 / 环境描写优化 / 心理描写优化
   → 选类型 → 记录 optimizeJob{status:'loading', ...快照, type} → 立即生成
   → 取消类型选择：关 modal，**恢复可编辑**，不清 selection（可直接再点「优化选区」）

4. textarea 保持 readOnly，全 AI 按钮 disabled，调 generateText
   4a. 生成中：显示 loading + 取消按钮（复用 runRef 机制）
       → 取消 → optimizeJob=null，恢复可编辑
   4b. 失败：optimizeError=脱敏消息，optimizeJob=null，恢复可编辑
       → 用户重新点「优化选区」（不在 modal 内加重试，与 4a 一致）
   4c. 成功：optimizeJob.status='success'，optimizedText 填入
       → 弹对照 modal：【原文】【改写稿】两块 + [确认替换][取消]

5. 确认替换：三重校验 → 通过则三段拼接写回 + rAF 选中新段 → optimizeJob=null，恢复可编辑
6. 取消/关闭对照 modal：optimizeJob=null，恢复可编辑，不写回。**取消路径不跑三重校验，直接丢弃改写稿**（校验只在「确认替换」路径执行）。
```

边界：

- 仅已完成章节（content 非空）显示「优化选区」入口；未开始/生成中章节不显示，不置灰占位。
- `selection.text.trim()` 为空时不允许发起优化。
- `selectedText` 过长（如超 1200 字）时：仍只传选中片段，不做整章；若模型返回 context 超限，走失败脱敏提示（与 4a 口径一致，不主动截断）。

## 五、AI 行为

- 新增 `buildOptimizeSelectionPrompt(novel, chapter, selectedText, type)`，放 `novelPrompts.ts`（沿用既有代码内常量方式）。
- **不复用死代码** `buildPolishChapterPrompt` / `buildRewriteChapterPrompt`（从未接线验证过，语义会拖偏）。
- 只喂 `selectedText`，不喂整章正文（选区级优化，输入即选区，省 token 且聚焦）。

**system 硬约束**：

```text
你是小说文本优化助手。
只优化用户选中的片段，直接输出优化后的正文。
不要解释，不要加标题，不要加引号，不要输出选中片段以外的内容。
不改变剧情走向、人物关系和关键信息。
输出长度应与原片段接近，不得大幅扩写或缩写。
```

（最后一句防止改写成两倍长，破坏写回后节奏。）

**三类 user 指令**：

对话优化：
```text
优化下面这段的对话：
让人物语言更自然、更有个性、更符合身份与当前情绪，
保留原有对话意图和信息，不新增剧情，不添加原文没有的台词。
```

环境描写优化：
```text
优化下面这段的环境描写：
增强画面感、氛围与感官细节，
但不喧宾夺主、不拖慢节奏，保留原有情节推进。
```

心理描写优化：
```text
优化下面这段的心理描写：
让人物内心活动更细腻、可信、贴合当前处境，
不改变人物已有决定和剧情走向。
```

**复用现有基础设施（零新增通道）**：

- `rendererBridge.generateText`（与正文生成同一 IPC）
- `requestIdRef` + `runRef`：优化请求登记到**同一套** requestId/run 版本控制，组件卸载/取消统一清理，不新增独立取消逻辑
- `ensureTextModel`：复用模型偏好检查
- 参数：`temperature` 0.7，`maxTokens` 1000（选区一般不长）
- 错误脱敏：复用现有 `result.message` 处理

**取消/卸载边界（与 4a 同款）**：

- 优化请求走现有 `requestIdRef`；组件卸载时现有 useEffect cleanup 自动取消
- 完成/取消后清 `requestIdRef`
- 切章/关 modal 不主动取消，除非 `optimizeJob.status === 'loading'`

## 六、视觉要求

延续工作台风格：

- 「优化选区」按钮放已完成章节编辑器 meta 行，与「历史版本」「章节评审」同级的轻量入口。
- 类型选择 modal 与对照 modal 均复用现有 `.novel-modal` + `.novel-workbench__preview` 骨架。
- 对照 modal：【原文】【改写稿】两块并列/上下展示（按段落），不做 diff 高亮。
- 如必须补样式，只允许少量改 `ChapterWorkbench.css`，不引入新视觉体系。

## 七、后置清单（不进 4b）

- 整章优化
- 自动 diff 高亮
- 多候选改写
- 优化结果版本化 / 历史记录 / 评分
- 一致性检查 / RAG / Bible / 角色卡
- 优化类型高频后的快捷按钮拆分（先单入口，用下来再说）
- 节奏检查（价值虚，明确不做）

**不做假入口：以上一律不展示，不置灰占位。**

## 八、验收标准

1. 已完成章节 meta 行显示「优化选区」入口；未开始/生成中章节不显示。
2. 未选择文本（或选区 trim 为空）时点「优化选区」，提示「请先选择要优化的正文」，不发起。
3. 有效选区点入口 → **textarea 立即转 `readOnly`** → 弹类型 modal（含选中文本前 80 字预览）→ 选三类之一 → 立即进入生成中；取消类型选择则恢复可编辑。
4. 类型 modal 打开期间及生成中：textarea 保持 `readOnly`，全 AI 按钮（优化/评审/大纲/正文生成）disabled，生成中可取消；同一时刻只有一个 AI 任务。
5. 生成成功弹对照 modal，展示【原文】【改写稿】；确认替换后选区被三段拼接结果替换，且新改写段自动选中高亮。
6. 生成失败显示脱敏错误，需重新点「优化选区」重试；正文不受影响。
7. 写回前三重校验：`chapterId / contentSnapshot / slice===selectedText` 任一失败，提示「原文范围已变化，请重新选择后生成」，不写回。
8. 取消类型选择不清 selection；取消生成/取消对照恢复可编辑，均不写回。
9. **零落库校验**：优化生成并弹对照 modal、随后取消（不确认替换）前后，`novel.json` 内容/hash 完全一致（改写稿在确认前不落库）。
10. 确认替换后 `content` 变更走现有保存链路正常落库；不新增 version、不改 `selectedVersionId`。
11. 不破坏 3a/3b/4a 全链路（顺序生成、多版本、大纲补齐、灵感模式、查看页、章节评审）、小说 CRUD、生图与资产模块。
12. 零新增 IPC / Provider / schema；仅新增一个 prompt 函数与工作台内 UI。

## 九、改动文件（预计 3 个）

1. **novelPrompts.ts** — 新增 `OptimizeType` + `buildOptimizeSelectionPrompt`。
2. **ChapterWorkbench.tsx** — 选区记录、`optimizeJob`/`optimizeError`/`optimizeTypeOpen` state、`textareaRef`、类型选择 modal、对照 modal、写回逻辑、busy 扩展、textarea readOnly + onSelect。
3. **ChapterWorkbench.css** — 如需补样式，少量（对照 modal、类型 modal），不引入新视觉体系。

## 建议实施顺序

1. 前端：prompt 函数 → 选区记录（onSelect + state）→ 类型选择 modal → 生成逻辑与互斥 → 对照 modal → 写回校验与替换。
2. QA：验收 12 条 + 回归 3a/3b/4a 关键路径（防覆盖、多版本写入、章节评审）+ 零落库 hash 校验。
