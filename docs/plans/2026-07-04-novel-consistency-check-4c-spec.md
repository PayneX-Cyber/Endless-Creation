# 小说创作 4c：轻量一致性检查 切片规格

日期：2026-07-04
上位文档：`docs/plans/2026-06-30-novel-creation-migration-plan.md`、`docs/plans/2026-07-03-novel-chapter-review-4a-spec.md`、`docs/plans/2026-07-04-novel-selection-optimize-4b-spec.md`

## 总体结论

4c 只做一件事：在 4a/4b 已完成的章节工作台里，增加**已完成章节的只读轻量一致性检查**。

一句话目标：

```text
已完成章节 → 一致性检查 → AI 基于蓝图、前文摘录、本章正文给出疑似矛盾点 → 只读查看
```

它不是 RAG，不是 Bible，不是角色数据库，不是全书审校系统，也不写回正文。

本切片采用「带前文摘录」方案：比单章检查更有价值，但仍不新增 schema，只用现有章节内容临时拼上下文。

## 一、数据口径

零 schema 新增。只读现有字段：

- Novel: `title`, `summary`, `idea`, `blueprint`, `chapters`
- Chapter: `title`, `outline`, `content`, `order`

一致性检查结果是纯会话态：

- 不写 `novel.json`
- 不写 `localStorage`
- 不新增 `consistencyReports`
- 不修改 `versions` / `selectedVersionId`
- 关闭面板即丢

前文上下文临时构造：

- 只取当前章节之前、已有正文的章节
- 每章传：章节序号、标题、outline 摘要、content 尾部摘录
- 实现可自定截断长度，建议每章尾部 300-500 字，总前文上下文控制在 3000-5000 字内
- 不生成/保存前文 summary

## 二、入口与用户流程

入口：已完成章节正文编辑器 meta 行，和「章节评审」「优化选区」「历史版本」同级。

显示规则：

- 已完成且 `content.trim()` 非空：显示「一致性检查」
- 未开始 / 生成中章节：不显示，不置灰占位

流程：

```text
点击「一致性检查」
→ 全局 busy，textarea readOnly，其他 AI 按钮 disabled
→ 调用 generateText
→ 成功：弹只读一致性报告面板
→ 关闭：报告丢弃，不落库
→ 失败：显示脱敏错误；可关闭后重新点击检查
```

与 4a 保持一致：不在错误 modal 内做重试按钮，不保存历史。

## 三、检查范围

Prompt 要求 AI 只输出疑似问题和定位建议，不做改写。

检查维度限制为四类：

1. 人物称呼 / 身份 / 关系是否漂移
2. 时间线 / 事件顺序是否冲突
3. 世界观 / 设定 / 规则是否前后矛盾
4. 本章内容是否明显违背作品蓝图或章节大纲

输出形态：自由文本，但必须分段清晰：

```text
总体判断：...
疑似矛盾：...
定位建议：...
修改建议：...
```

若未发现明显问题，应明确输出「未发现明显一致性问题」，并给出 1-2 条保守提醒。禁止为了凑内容编造矛盾。

## 四、AI 行为

新增一个 prompt 函数：`buildChapterConsistencyPrompt(...)`。

复用现有：

- `rendererBridge.generateText`
- `ensureTextModel`
- `requestIdRef/runRef`
- 4a 的只读 modal / loading / cancel / error 脱敏模式

不新增：

- IPC
- Provider
- prompt registry
- 模型路由
- RAG / embedding
- 后台任务

建议参数：沿用 4a 评审参数即可；若实现者需要，可把 `maxTokens` 控制在 1000-1500。

## 五、互斥与状态

延续 4b 的全局互斥口径：同一工作台同时只允许一个 AI 任务。

`busy` 需要覆盖：

- 章节正文生成
- 后续大纲生成
- 章节评审
- 选区优化类型 modal / 生成 / 对照 modal
- 一致性检查

一致性检查期间：

- textarea `readOnly = busy`
- 章节评审 / 优化选区 / 生成后续大纲 / 按顺序生成全部 disabled
- 可取消当前一致性检查请求

## 六、视觉要求

复用 4a 章节评审面板风格。

- meta 行新增一个轻量按钮：「一致性检查」
- loading 文案：「正在检查一致性…」
- modal 标题：「一致性检查」
- 内容按段落展示
- 不做表格、不做 diff、不做彩色风险等级、不做历史列表

## 七、后置清单

不进入 4c：

- 全书一致性数据库
- Bible / 角色卡 / 世界观 schema
- RAG / embedding / 长上下文记忆
- 结构化问题对象、严重级别、定位到精确句子
- 一键修复 / 写回正文
- 检查历史、报告导出
- 多章批量审校
- 与资产库联动

## 八、验收标准

1. 已完成章节显示「一致性检查」入口；未开始/生成中章节不显示。
2. 点击后进入 loading，textarea readOnly，其他 AI 按钮 disabled，可取消。
3. 成功后展示只读一致性报告，关闭后报告丢弃。
4. 失败时显示脱敏错误，已有正文/版本/大纲不丢。
5. Prompt 输入包含：小说标题、summary/blueprint、当前章节 title/outline/content、前文已完成章节摘录。
6. 前文摘录不落库，不新增 summary 字段。
7. 检查结果不写入 novel.json；检查前后 novel 数据 hash 不变。
8. 不修改 `versions` / `selectedVersionId`，不产生版本。
9. 不新增 IPC / Provider / schema / prompt registry。
10. 不破坏 3a 顺序生成、大纲补齐、3b 多版本、4a 章节评审、4b 选区优化。

## 九、建议改动文件

预计只改 2 个文件：

- `src/features/novel-creation/novelPrompts.ts`
  - 新增 `buildChapterConsistencyPrompt(...)`
- `src/features/novel-creation/ChapterWorkbench.tsx`
  - 新增一致性检查状态、生成函数、入口、modal

通常不需要改 CSS；若必须补 loading 类，复用 4a/4b 样式，少量追加。
