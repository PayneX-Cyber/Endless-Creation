# 小说创作 4a：章节评审 实施方案

日期：2026-07-03  
上位文档：`docs/plans/2026-07-03-novel-chapter-review-4a-spec.md`（4a 规格）  
状态：已实施，提交 `fbcfce5`

## 一、方案总览

### 目标
已完成章节 → 点击「章节评审」→ AI 基于蓝图/大纲/正文给出一段评审意见 → 只读展示，随手关闭

### 技术边界
- **零 schema 新增**：评审结果只存组件 state，不落库
- **零新增 IPC**：复用现有 `generateText` 通道
- **零新增基础设施**：复用现有 modal 风格、错误脱敏、超时/取消逻辑

### 改动范围
优先只改 2 个文件：
1. `src/features/novel-creation/novelPrompts.ts` — 新增 `buildChapterReviewPrompt()` 函数
2. `src/features/novel-creation/ChapterWorkbench.tsx` — 新增评审按钮 + 评审 modal + 状态管理

如必须补充样式（现有 `.novel-modal` / `.novel-workbench__preview` 不够用）：
3. `src/features/novel-creation/ChapterWorkbench.css` — 少量补充样式

**严禁**：
- 新增 schema 字段（如 `chapter.review`、`novel.reviewHistory`）
- 新增 IPC / Provider / 评分系统 / diff 对比 / 写回流程 / 历史记录
- 引入新视觉体系（如新的 modal 框架、第三方组件库）

---

## 二、详细设计

### 2.1 Prompt 函数设计

**位置**：`src/features/novel-creation/novelPrompts.ts`

**函数签名**：
```typescript
export function buildChapterReviewPrompt(novel: Novel, chapter: Chapter): TextMessage[]
```

**输入**：
- `novel.title` — 小说标题
- `novel.summary` — 小说简介（可选）
- `novel.blueprint` — 作品蓝图（可选）
- `chapter.title` — 章节标题
- `chapter.outline` — 本章大纲（可选）
- `chapter.content` — 本章正文（**完整传入，不截断**）

**输出**：
- 自由文本评审意见（优点 / 问题 / 修改建议）
- 不要求结构化评分、不要求 JSON 格式

**Prompt 内容**（参考实现）：
```typescript
export function buildChapterReviewPrompt(novel: Novel, chapter: Chapter): TextMessage[] {
  return [
    { 
      role: 'system', 
      content: '你是小说评审助手，基于作品蓝图和章节大纲评估章节正文质量。输出评审意见，包含优点、问题和修改建议，直接输出评审内容，不加标题，不使用 Markdown 标记。'
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${novel.blueprint}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        chapter.outline ? `本章大纲：\n${chapter.outline}` : '',
        '本章正文：',
        chapter.content,
        '请评审本章正文，指出优点、存在的问题（如偏离大纲、节奏拖沓、人物行为不合理等）以及修改建议。评审意见 200-400 字。',
      ].filter(Boolean).join('\n'),
    },
  ];
}
```

**说明**：
- 完整传入 `chapter.content`，不做截断（如超 context 则由模型返回错误，前端显示脱敏提示）
- 输出为自由文本，不要求结构化字段
- 参考迁移源 `docs/novel-module/evaluation.md` 的意图，但 4a 不做六维审稿

---

### 2.2 状态管理设计

**位置**：`src/features/novel-creation/ChapterWorkbench.tsx`

**新增状态**：
```typescript
const [reviewBusy, setReviewBusy] = useState(false);
const [reviewError, setReviewError] = useState('');
const [reviewResult, setReviewResult] = useState<{ chapterId: string; content: string } | null>(null);
```

**全局互斥**：
- 现有 `busy` 变量：`const busy = generatingChapterId !== null || outlineBusy;`
- 修改为：`const busy = generatingChapterId !== null || outlineBusy || reviewBusy;`
- 评审按钮 `disabled={busy}` 确保与正文生成/大纲生成互斥

**状态流转**：
1. 点击「章节评审」→ `setReviewBusy(true)`、`setReviewError('')`
2. 生成中：显示 loading，可取消
3. 成功：`setReviewResult({ chapterId, content })`、`setReviewBusy(false)`
4. 失败：`setReviewError(message)`、`setReviewBusy(false)`

---

### 2.3 UI 组件设计

#### 2.3.1 评审按钮入口

**位置**：已完成章节的编辑器 meta 行（`ChapterWorkbench.tsx:300-305`）

**当前代码**：
```typescript
<div className="novel-workbench__editor-meta">
  <span>{saveStatusLabel(saveStatus)}</span>
  <span>{countWords(activeChapter.content)} 字</span>
  {saveStatus === 'failed' && <button ... >重试保存</button>}
  {versions.length > 0 && <button ... >历史版本</button>}
</div>
```

**修改为**：
```typescript
<div className="novel-workbench__editor-meta">
  <span>{saveStatusLabel(saveStatus)}</span>
  <span>{countWords(activeChapter.content)} 字</span>
  {saveStatus === 'failed' && <button ... >重试保存</button>}
  {versions.length > 0 && <button ... >历史版本</button>}
  {activeChapter.content.trim() && (
    <button 
      className="novel-flow__ghost" 
      disabled={busy} 
      onClick={() => void generateChapterReview(activeChapter)} 
      type="button"
    >
      章节评审
    </button>
  )}
</div>
```

**显示条件**：
- 只对**已完成章节**（`content.trim() !== ''`）显示
- 未开始/生成中章节不显示（不做置灰占位）

---

#### 2.3.2 评审 Modal

**复用**：参考「历史版本」modal 的轻量风格（`ChapterWorkbench.tsx:411-433`）

**结构**：
```typescript
{reviewResult && reviewResult.chapterId === activeChapter?.id && (
  <div className="novel-modal" role="dialog" aria-modal="true" aria-label="章节评审" onClick={() => setReviewResult(null)}>
    <div className="novel-workbench__preview" onClick={(event) => event.stopPropagation()}>
      <h2>章节评审</h2>
      <p className="novel-workbench__preview-sub">AI 基于作品蓝图和章节大纲给出的评审意见，仅供参考。</p>
      <div className="novel-workbench__review-content">
        {reviewResult.content.split('\n').filter(p => p.trim()).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      <footer>
        <button className="novel-flow__ghost" onClick={() => setReviewResult(null)} type="button">关闭</button>
        <button 
          className="novel-flow__ghost" 
          disabled={busy} 
          onClick={() => void generateChapterReview(activeChapter!)} 
          type="button"
        >
          重新评审
        </button>
      </footer>
    </div>
  </div>
)}
```

**说明**：
- 复用 `.novel-modal` 和 `.novel-workbench__preview` 样式
- 评审内容按段落展示（`split('\n')`）
- 「重新评审」按钮直接重新发起请求，不弹二次确认（方案 A）
- 关闭即丢（瞬时数据，不落库）

---

#### 2.3.3 评审中状态

**位置**：在 `renderMain()` 中，当 `reviewBusy && activeChapter` 时，在编辑器下方显示评审中提示

**实现**：
```typescript
{status === 'done' && reviewBusy && (
  <div className="novel-workbench__review-loading">
    <span className="novel-workbench__spinner" aria-hidden="true" />
    <span>正在评审章节…</span>
    <button className="novel-flow__ghost" onClick={cancelReview} type="button">取消</button>
  </div>
)}
```

**或**：复用现有 loading 样式，放在编辑器上方显示一个轻量提示条

---

#### 2.3.4 评审失败提示

**位置**：编辑器 meta 行下方（与 `saveStatus === 'failed'` 同级）

**实现**：
```typescript
{reviewError && activeChapter && (
  <p className="novel-flow__error">{reviewError}</p>
)}
```

**说明**：
- 错误信息脱敏（复用现有脱敏逻辑）
- 不在 error 提示上加「重试」按钮（方案 A：用户需关闭后重新点「章节评审」）

---

### 2.4 生成逻辑

**位置**：`ChapterWorkbench.tsx`

**新增函数**：
```typescript
async function generateChapterReview(chapter: Chapter) {
  if (busy || !chapter.content.trim()) return;
  
  const ready = ensureTextModel((message) => setReviewError(message));
  if (!ready) return;
  
  const requestId = createId('text-request');
  const runId = runRef.current + 1;
  runRef.current = runId;
  requestIdRef.current = requestId;
  
  setReviewBusy(true);
  setReviewError('');
  setReviewResult(null);
  
  const result = await rendererBridge.generateText({
    requestId,
    channelId: ready.channelId,
    channelLabel: ready.channelLabel,
    baseUrl: ready.baseUrl,
    apiKey: ready.apiKey,
    model: ready.model,
    messages: buildChapterReviewPrompt(novel, chapter),
    temperature: 0.7,
    maxTokens: 800,
  });
  
  if (runRef.current !== runId) return;
  requestIdRef.current = null;
  setReviewBusy(false);
  
  if (!result.ok || !result.text) {
    setReviewError(result.message || '评审失败，请稍后重试。');
    return;
  }
  
  setReviewResult({ chapterId: chapter.id, content: result.text.trim() });
}

function cancelReview() {
  const requestId = requestIdRef.current;
  runRef.current += 1;
  requestIdRef.current = null;
  setReviewBusy(false);
  if (requestId) void rendererBridge.cancelTextGeneration(requestId);
}
```

**取消与卸载边界**：
- 评审请求也登记到现有 `requestIdRef`（与正文生成/大纲生成共用）
- 组件卸载时，现有 `useEffect` cleanup 会取消 `requestIdRef.current`，自动覆盖评审请求
- 评审完成后清空 `requestIdRef.current = null`
- **切换章节/关闭 modal 不需要主动取消**（除非仍在 `reviewBusy` 状态）
- 不新增复杂取消逻辑，复用现有 `runRef` 版本控制

**说明**：
- 复用现有 `generateText` IPC，参数与正文生成/大纲生成一致
- `temperature: 0.7`（适中）、`maxTokens: 800`（评审意见 200-400 字）
- 取消逻辑复用现有 `cancelGeneration` 模式
- 超时 60s（由 IPC 层控制，前端无需额外处理）

---

## 三、实施顺序

### 第一步：Prompt 函数（15 分钟）
1. 打开 `novelPrompts.ts`
2. 在文件末尾新增 `buildChapterReviewPrompt()` 函数
3. 参考上述设计，输入完整章节 content
4. 跑 `npm run build` 确保编译通过

### 第二步：状态管理与生成逻辑（30 分钟）
1. 打开 `ChapterWorkbench.tsx`
2. 新增 3 个状态：`reviewBusy`、`reviewError`、`reviewResult`
3. 修改 `busy` 变量定义，加入 `reviewBusy`
4. 新增 `generateChapterReview()` 和 `cancelReview()` 函数
5. 在 `useEffect` cleanup 中确保评审请求也会被取消

### 第三步：UI 组件（45 分钟）
1. 在编辑器 meta 行新增「章节评审」按钮
2. 新增评审 modal（复用 `.novel-modal` 和 `.novel-workbench__preview`）
3. 新增评审中 loading 提示
4. 新增评审失败错误提示
5. 确保所有按钮 `disabled={busy}` 互斥

### 第四步：自测与验证（30 分钟）
1. `npm run build` — 必须通过
2. `npm run dev` — 启动应用
3. 验收标准 1-7 逐条测试（见下节）
4. 回归测试：生成正文、大纲补齐、历史版本不受影响

---

## 四、验收自检清单

实施完成后，按以下顺序自测：

### 1. 入口显示正确
- [ ] 已完成章节（content 非空）的编辑器 meta 行显示「章节评审」按钮
- [ ] 未开始章节（content 为空）不显示「章节评审」按钮
- [ ] 生成中章节（`generatingChapterId === chapter.id`）不显示「章节评审」按钮

### 2. 全局互斥
- [ ] 点击「章节评审」后，「按顺序生成」、「生成后续大纲」、「再生成一版」按钮全部 disabled
- [ ] 正文生成中时，「章节评审」按钮 disabled
- [ ] 大纲生成中时,「章节评审」按钮 disabled

### 3. 评审中状态
- [ ] 点击「章节评审」后显示 loading 提示
- [ ] 可点击「取消」按钮中止评审
- [ ] 取消后恢复初始状态（按钮可再次点击）

### 4. 评审成功
- [ ] 评审完成后弹出只读 modal
- [ ] Modal 显示评审内容，按段落展示
- [ ] 有「关闭」和「重新评审」两个按钮
- [ ] 点击「关闭」后 modal 消失
- [ ] 点击「重新评审」后直接重新发起评审（不弹二次确认）

### 5. 评审失败
- [ ] 评审失败显示错误提示（脱敏后的消息）
- [ ] 错误提示不包含「重试」按钮（用户需重新点「章节评审」）
- [ ] 重新点击「章节评审」能正常发起

### 6. 零落库（必须用文件 hash 验证）
- [ ] 评审前记录 `novel.json` 的完整内容或文件 hash（如 `md5sum novel.json`）
- [ ] 点击「章节评审」，等待评审成功
- [ ] 关闭评审 modal
- [ ] 再次查看 `novel.json`，内容/hash 与评审前**完全一致**（不只是 `updatedAt`，整个文件都不能变）
- [ ] `novel.json` 中未新增任何字段（如 `review`、`reviewHistory`、`lastReviewAt` 等）
- [ ] **如果评审前后 `novel.json` 有任何差异，视为 FAIL**

### 7. 回归测试
- [ ] 正文生成、大纲补齐、历史版本、多版本草稿流程不受影响
- [ ] 小说 CRUD、项目查看页、生图资产模块不受影响

---

## 五、技术细节说明

### 5.1 为什么不做截断？
- 小说章节一般 2000-5000 字，Claude 200K token context 足够
- 如真的超限，模型会返回 context length 错误，前端显示脱敏提示即可
- 避免"为什么不给完整章节"的后续争议
- 后续如遇到长章问题，再做「智能截断/分段评审」独立切片

### 5.2 为什么不做结构化评分？
- 4a 目标是"验证评估链路"，先证明「Prompt + 当前小说上下文 + 文本生成接口」能跑通
- 六维审稿、评分卡、雷达图全部后置（规格第五节后置清单）
- 自由文本评审更灵活，用户可直接阅读，不需要额外解析

### 5.3 为什么不做评审历史？
- 规格明确「零 schema 新增，零落库」
- 评审结果是瞬时数据，关闭即丢
- 先验证"评审意见是否有用"，再决定要不要为它建结构
- 用户如需保留评审可自行截图/复制

### 5.4 为什么不在 modal 里加重试按钮？
- 4a 目标是"验证链路"，不是"优化 UX"
- 错误 modal 只负责展示，不管重试逻辑，实现更简单
- 用户关闭后重新点「章节评审」即可重试

---

## 六、风险与边界

### 已规避风险
1. ✅ **超长章节**：不做截断，超限则报错，后续再优化
2. ✅ **评审质量**：先验证链路，后续再迭代 prompt 和结构化评分
3. ✅ **并发冲突**：全局互斥，避免多个 AI 任务同时运行
4. ✅ **数据丢失**：不落库，无数据迁移风险

### 不做的事（后置）
- 六维审稿、结构化评分、评审历史落库
- 人物一致性检查、轻量 consistency checker
- 对话/环境/心理/节奏优化及其写回流程
- 按评审建议一键改写、读者模拟、自我批判
- Prompt Registry、任务模型路由

---

## 七、预期交付物

1. **代码改动**：2 个文件（`novelPrompts.ts`、`ChapterWorkbench.tsx`）
2. **构建验证**：`npm run build` 通过
3. **自测结果**：验收清单 1-7 全部 PASS
4. **回归测试**：3a/3b 关键路径（顺序生成、多版本、大纲补齐）不破坏

---

## 八、后续优化方向（不进 4a）

- **4b**：六维审稿（人物塑造、情节推进、对话质量、环境描写、情感表达、节奏把控）
- **4c**：人物一致性检查（基于轻量 Bible）
- **4d**：评审建议写回流程（diff 展示 + 确认写入）
- **4e**：Prompt Registry + 任务模型路由

---

**方案已实施。**
