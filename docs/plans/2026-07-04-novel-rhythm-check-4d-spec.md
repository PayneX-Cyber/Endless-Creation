# 小说创作 4d：轻量节奏检查 切片规格

日期：2026-07-04

## 总体结论

4d 只做一件事：在章节工作台里给已完成章节增加只读「节奏检查」。

目标流程：

```text
已完成章节 → 节奏检查 → AI 基于蓝图/大纲/正文指出节奏问题 → 只读查看
```

## 范围

- 只读检查，不改正文。
- 检查结果只存在组件 state，关闭即丢。
- 不新增 schema / IPC / Provider / Prompt Registry。
- 不写 `versions` / `selectedVersionId`。
- 不做 diff、一键修复、历史报告、批量检查。

## 入口与交互

- 已完成章节正文编辑器 meta 行显示「节奏检查」。
- 未开始 / 生成中章节不显示假入口。
- 点击后进入 loading，textarea `readOnly`，其它 AI 按钮 disabled。
- 支持取消。
- 成功后弹只读「节奏检查」报告 modal。
- 失败时显示脱敏错误，正文和版本不变。

## Prompt 要求

输入包含：

- 小说标题
- summary / blueprint / idea
- 当前章节 title / outline / content

检查维度限制为：

1. 开头是否拖沓或进入冲突过慢
2. 中段是否重复、解释过多、缺少推进
3. 结尾是否缺少钩子或收束过急
4. 段落节奏、信息密度、情绪起伏是否失衡

输出自由文本，但应包含：

```text
总体判断：...
节奏问题：...
定位建议：...
调整建议：...
```

## 验收标准

1. 已完成章节显示「节奏检查」入口；未开始/生成中章节不显示。
2. 点击后进入 loading，textarea readOnly，其它 AI 按钮 disabled，可取消。
3. 成功后展示只读「节奏检查」报告，关闭后报告丢弃。
4. 失败显示脱敏错误；正文、outline、versions、selectedVersionId 不变。
5. Prompt 输入包含标题、summary/blueprint/idea、当前章节 title/outline/content。
6. 零落库：检查成功 modal 打开/关闭前后 novel 数据 hash 不变。
7. 不修改 `versions` / `selectedVersionId`，不产生版本。
8. 不新增 IPC / Provider / schema / prompt registry。
9. 不破坏 3a 顺序生成、大纲补齐、3b 多版本、4a 章节评审、4b 选区优化、4c 一致性检查。
