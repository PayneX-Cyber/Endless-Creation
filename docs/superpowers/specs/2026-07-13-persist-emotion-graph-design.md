---
comet_change: persist-emotion-graph
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-14-persist-emotion-graph
status: final
---

# 情感曲线与人物图谱统一持久化技术设计

## 目标

把情感曲线与人物图谱从按 novelId 聚合的 renderer localStorage 迁入 Novel v6，使它们与小说一起保存、进入离线包并跨设备保留。迁移不得覆盖 Novel 已有成果，不得因坏旧数据阻断加载，也不得在 saveNovel 失败时删除旧数据。

## 数据模型

在 schema 级类型中定义并同步四份 Novel 接口：

- `EmotionPoint`：`chapterId`、`score`、`reason`、`updatedAt`
- `EmotionArc`：`points`、`updatedAt`
- `GraphCharacter`：`name`、`role`、`description`
- `GraphRelationship`：`from`、`to`、`label`
- `CharacterGraph`：`characters`、`relationships`
- `Novel.emotionArc?: EmotionArc`
- `Novel.characterGraph?: CharacterGraph`
- `Novel.version: 6`

两个字段保持可选。字段缺失由 `undefined` 表示；主进程和 Web fallback 的 sanitizer 都不得合成空对象。`points` 为空但结构完整的 EmotionArc，以及空 characters/relationships 的 CharacterGraph，都是已确认成果。

## 消毒边界

主进程 `sanitizeNovel` 与 renderer Web fallback 使用同一字段语义：

- 分值必须是有限数且位于 -100 到 100。
- 所有必需字符串必须为字符串；无效点、人物或关系不得进入 Novel。
- EmotionArc/CharacterGraph 整体不合法时字段置为 undefined。
- 老 v4/v5 数据的章节、设定、伏笔、钉选等字段按现有逻辑保留，version 强制为 6。

主进程不读取 localStorage，也不执行存量搬运。

## Renderer 惰性迁移

新增小型 renderer helper，集中负责旧数据读取、校验、迁移与清理。`openNovel` 在 `loadNovel` 成功后、写入 React state 前 await 迁移，避免先显示空成果再闪变。

单次加载流程：

1. 安全解析两个完整存储表：
   - `endless-creation.novel-emotion-arcs`
   - `endless-creation.novel-character-graphs`
2. 分别读取当前 novelId 条目并做结构校验。
3. 对 Novel 字段为 undefined 且旧条目合法的类型，将旧成果合并到同一个 nextNovel。
4. 若至少迁入一个字段，只调用一次 `saveNovel(nextNovel)`。
5. 仅当保存返回成功后，清理已经由 Novel 承接的合法旧条目。
6. 若字段原本已存在且旧条目合法，Novel 不覆盖；该旧条目视为崩溃残留并清理。
7. 解析失败、结构非法或 saveNovel 失败时保留旧条目；小说仍使用原 Novel 正常打开。

删除操作读取完整表、只删除当前 novelId，再写回其余条目；表为空时可删除整个存储键。任一 localStorage 写入失败只造成残留，不影响已落盘 Novel。

## 正常读写路径

迁移后不再双写：

- `EmotionArcPanel` 直接读取 `novel.emotionArc`。用户确认分析结果后，用现有 `mergeEmotionPoints` 生成新成果，通过父级 `updateNovel` 写入字段。
- 人物图谱面板直接读取 `currentNovel.characterGraph`。AI 推演成功或得到合法空图谱后，通过 `updateNovel` 写入字段。
- `emotionArc.ts` 删除普通 getItem/setItem IO；图谱的 `readCharacterGraph`/`saveCharacterGraph` 删除。
- 两个旧存储键只允许迁移 helper 读取或清理。

`updateNovel` 继续复用现有 600ms 自动保存、关窗 flush 与失败重试。离线包仍直接序列化 Novel，无需修改导出实现。

## 错误与中断

- 旧表 JSON 损坏：不迁移、不删除、不抛到 UI。
- 单条旧成果结构损坏：该条保留，其他类型可独立迁移。
- saveNovel 失败：返回原 Novel，旧条目全部保留，下次加载重试。
- saveNovel 成功、删除前退出：下次加载发现 Novel 字段已有且旧条目合法，只清理残留。
- 删除旧条目失败：Novel 已安全落盘；保留残留供下次清理。

## 最小验证

1. sanitizer 自检：v4/v5→v6、合法成果保留、非法成果置 undefined、原字段不丢。
2. renderer 迁移自检：双字段合并一次保存、合法空成果不覆盖、已有字段不覆盖、坏数据保留、保存失败不删、仅删除当前 novelId。
3. `npm.cmd run build`。
4. 文本完整性扫描与 `git diff --check`。
5. GUI 真机：
   - 旧数据首次加载即显示并落入 Novel；
   - 重开仍保留，旧 localStorage 当前条目已清；
   - 新分析/推演不再写 localStorage；
   - 离线包 novel.json 含两字段；
   - 人为制造保存失败时旧数据保留。

## 非目标

不持久化伏笔 AI 候选，不迁移模型/API 应用级配置，不新增 IPC、依赖、向量库或新的导出格式。

