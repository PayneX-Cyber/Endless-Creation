# Comet Design Handoff

- Change: persist-emotion-graph
- Phase: design
- Mode: compact
- Context hash: 5c0dff8f42d28b5208474837346145f4aacaa1a80fa735117bba6e0aa56d0be2

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/persist-emotion-graph/proposal.md

- Source: openspec/changes/persist-emotion-graph/proposal.md
- Lines: 1-29
- SHA256: 96c72b572e0b37ece1bae99fccb30bdc36295ee6b790f67dc6da0cb6575bb6e4

```md
## Why

情感曲线（逐章 AI 情绪分析）与人物关系图谱（AI 推演）是用户确认后的创作成果，但当前都存在按 novelId 索引的**全局 localStorage**（`endless-creation.novel-emotion-arcs` / `endless-creation.novel-character-graphs`），不随小说本体保存。后果：换设备、清缓存、导出离线包时这些成果全丢——离线包 `novel.json` 直接序列化 `Novel`，而这两份数据不在 `Novel` 里，导出协议自然带不上。这是用户视角剩余痛点 #6（用户成果落 localStorage 不进导出）的唯二两处。本 change 把它们迁进 `Novel` schema（v5→6），让成果随作品持久化、进导出、跨设备保留。

伏笔 AI 候选**不在本次范围**——它是 React 会话态、切章即清、接受后已转成 Novel 正式伏笔，是可再生成的中间结果，落库反而污染主数据、违背"先候选再确认"防污染设计。

## What Changes

- **schema 扩展**：`Novel` 新增 `emotionArc?` 与 `characterGraph?` 两字段，version `5 → 6`。四份接口副本（`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`）同步，`sanitizeNovel` 加两字段消毒；老 Novel（v4/v5）加载迁移到 v6，补空字段、不丢原数据。
- **存量数据迁移（renderer 层，惰性）**：加载单本小说时，若 `Novel` 字段**缺失（undefined）**且 localStorage 有该 `novelId` 的数据，则读 localStorage → 结构校验 → 写入 `Novel` 字段 → `saveNovel` → **确认落盘成功后删除该 localStorage 条目**。触发条件严格为字段 undefined（非"字段为空"）——`points` 为空但仍含 `updatedAt` 的合法 `EmotionArc`，以及 `{ characters: [], relationships: [] }` 的合法 `CharacterGraph`，字段均非 undefined，不迁移不覆盖；可解析的崩溃残留（字段已有 + 旧条目仍存在）直接清条目；坏数据（解析/结构校验失败）正常加载、保留、不写不删。localStorage 仅 renderer 可读，故迁移点在 renderer（不在主进程 `sanitizeNovel`）。
- **读写源切换**：迁移后情感曲线/图谱的读写改走 `Novel` 字段（经现有 `saveNovel` 自动保存链），`emotionArc.ts` 与图谱的 localStorage IO 下线。
- **导出自动带上**：离线包 `novel.json` 直接序列化 `Novel`，字段进 schema 后导出协议零改动即自动包含。

## Capabilities

### New Capabilities
- `novel-analysis-persistence`: 把情感曲线与人物图谱两类分析成果纳入 `Novel` schema 持久化——含 schema v5→6、renderer 层 localStorage 存量数据惰性迁移（先写成功再删旧数据）、读写源切换到 Novel 字段、随导出协议输出。

### Modified Capabilities
<!-- 无。现有 openspec/specs/ 各 capability 均与本 change 无关；不涉及其 spec 级需求变更。 -->

## Impact

- **Schema（BREAKING）**：`Novel` v5→6，四份副本同步新增 `emotionArc?`/`characterGraph?`；`sanitizeNovel` 消毒两字段；version 迁移补空。`EmotionArc`/`CharacterGraph` 类型定义纳入 schema。
- **存量数据迁移（不可逆，本包核心风险）**：renderer 加载单本时 localStorage → Novel 字段 → saveNovel → 删条目。必须"先 saveNovel 成功确认落盘、再删 localStorage 条目"；中断/失败保留 localStorage 不删，防丢用户已分析成果。触发条件为字段 undefined；合法空成果不覆盖；崩溃残留（字段已有但旧条目残留）直接清条目；坏数据不阻断加载、不删、不写。
- **持久化**：迁移后走现有 `saveNovel`（temp→rename 原子写 + debounce），无新增 IPC。
- **读写重构**：`emotionArc.ts` IO 层（getItem/setItem，行 71/92）、图谱 `saveCharacterGraph`/`readLocalStorage`（`NovelCreation.tsx:729/734/1298-1305`）改为读写 Novel 字段；调用点 `EmotionArcPanel`、`NovelCharacterGraph` 面板存取改道。
- **导出协议**：无需改导出逻辑；字段随 Novel 序列化进 `novel.json`。
- **不涉及**：伏笔 AI 候选、model-preferences/api-provider-config 等应用级配置、新依赖、向量库。

```

## openspec/changes/persist-emotion-graph/design.md

- Source: openspec/changes/persist-emotion-graph/design.md
- Lines: 1-70
- SHA256: 20e8d62adaa6492a68c224278602a423da95f1f8dfe7d53cf6b250a9d30556cf

```md
## Context

情感曲线（`emotionArc.ts`，存储键 `endless-creation.novel-emotion-arcs`）与人物图谱（`NovelCreation.tsx`，`CHARACTER_GRAPH_STORAGE_KEY = endless-creation.novel-character-graphs`）当前都存在按 `novelId` 索引的**全局 localStorage**，不随 `Novel` 本体保存。离线包 `novel.json` 直接序列化 `Novel`，故这两份成果不进导出、换设备/清缓存即丢。本 change 把它们迁进 `Novel` schema（v5→6），使成果随作品持久化、进导出、跨设备保留。

localStorage 仅 renderer 可读，主进程 `sanitizeNovel` 读不到，故**存量数据搬运只能在 renderer 层**；而 schema 版本迁移（保持缺失字段为 undefined、version 强制 6）在主进程 `sanitizeNovel` 完成。两条迁移轨并行、职责分离。

伏笔 AI 候选**不在范围**——它是 `ChapterWorkbench` 的 `useState` 会话态，切章即清（:172-176），接受后已 `onUpdateNovel` 转成 Novel 正式伏笔（:851），是可再生成的中间结果，落库反污染主数据。

## Goals / Non-Goals

**Goals:**
- `Novel` 新增 `emotionArc?` / `characterGraph?` 两字段，version `5 → 6`，四份接口副本同步，`sanitizeNovel` 消毒 + 迁移（缺失字段保持 undefined）。
- renderer 层惰性搬运 localStorage 存量数据进 `Novel` 字段，**先 saveNovel 成功、再删 localStorage 条目**；失败/中断保留旧数据。
- 情感曲线/图谱读写源切换到 `Novel` 字段，localStorage 写路径下线。
- 字段随 Novel 序列化自动进离线包导出，导出逻辑零改动。

**Non-Goals:**
- 伏笔 AI 候选落库（会话态，不迁）。
- 语义检索/向量库/新依赖。
- 导出协议改动、新增 IPC。
- 历史 localStorage 数据的批量一次性迁移脚本（采用惰性、按小说加载迁移）。

## Decisions

### D1：schema v5→6，两字段进 Novel，四副本同步
`Novel` 加 `emotionArc?: EmotionArc` 与 `characterGraph?: CharacterGraph`（**可选，缺省 undefined**）。`EmotionArc`/`CharacterGraph` 类型从 `emotionArc.ts` / 图谱模块提升为 schema 级类型定义。四份副本（`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`）同步新增字段 + version 6。沿用 pinned-ai-context 的 schema 破例先例（该包已把 version 推到 5）。

### D2：版本迁移在主进程 sanitizeNovel（保持 undefined、不补空对象、不搬运）
`sanitizeNovel` 加载即消毒：version 强制 6；`emotionArc`/`characterGraph` 字段类型校验——合法则保留，**非法或缺失则置为 undefined，绝不合成任何空成果对象**。这是关键：若补空对象，renderer 迁移探测（"字段 undefined 才迁移"）将永远不触发，存量数据搬不进来。**sanitizeNovel 不读 localStorage、不做存量搬运**。v4/v5 老 Novel 经此保持字段缺省、其余数据原样保留。

### D3：存量搬运在 renderer 层，惰性、幂等（触发条件 = 字段 undefined）
加载单本小说时（renderer 已持有 Novel 对象），执行一次迁移探测。触发条件严格为**字段 undefined**，非"字段为空"——`points` 为空但仍含 `updatedAt` 的合法 `EmotionArc`，以及 `{ characters: [], relationships: [] }` 的合法 `CharacterGraph`，字段均非 undefined，不迁移、不覆盖：
- 若 `novel.emotionArc === undefined` **且** localStorage `endless-creation.novel-emotion-arcs` 有该 `novel.id` 条目 → 读出 → 结构校验 → 写入 `novel.emotionArc` → `saveNovel`。
- 图谱同理（`novel.characterGraph === undefined` / `endless-creation.novel-character-graphs`）。
- 若字段非 undefined（含合法空成果）→ **跳过写入**（幂等，不覆盖、不重复迁移），但仍执行 D4 的残留条目清理。
- 若 localStorage 无对应条目 → 不迁移，字段保持 undefined。

### D4：数据安全顺序——先写成功、再删条目 + 崩溃残留清理（本包核心风险）
存量迁移**必须** `saveNovel` 成功落盘后才删除 localStorage 条目：
```
字段 undefined 且旧条目存在：
  读 localStorage[novelId] → 结构校验
    → 写入 Novel 字段
    → await saveNovel（等待落盘结果）
    → 成功：删除 localStorage 该 novelId 条目
    → 失败/抛错：保留 localStorage，不删，下次加载重试

字段已有数据 且可解析、结构合法的旧条目仍存在（saveNovel 成功后、删除前曾崩溃的残留）：
    → 不覆盖字段
    → 直接删除该 novelId 残留条目
```
若无"字段已有 + 残留条目 → 清理"分支，则崩溃后旧数据将永久残留 localStorage 且再不进入迁移路径（因字段已存在被跳过）。saveNovel 走既有 temp→rename 原子写，返回可 await 的结果。删除只移除该 `novelId` 条目，不动同键其他小说数据。迁移可安全重入。

### D5：损坏旧数据容错
所有迁移与残留清理都必须先解析、再做结构校验。若 JSON 解析失败或结构校验（字段/类型）不通过：小说**正常加载**、**保留旧条目不删除**、**不写入 Novel 字段**；即使 Novel 字段已有数据，也不得进入 D4 的残留删除分支。不因坏数据阻断小说加载，也不把坏数据搬进 schema。

### D6：读写源切换，localStorage 写路径下线
迁移完成后：
- 情感曲线：`emotionArc.ts` 的 getItem（:71）/ setItem（:92）改为读写 `novel.emotionArc`，upsert 后经 `saveNovel` 落库（复用现有自动保存链）。
- 图谱：`NovelCreation.tsx` 的 `saveCharacterGraph`（:729/734/1302-1305）/ `readLocalStorage`（:1298）改为读写 `novel.characterGraph`，走 `updateNovel` 落库链。
- 存储键常量（`endless-creation.novel-emotion-arcs` / `endless-creation.novel-character-graphs`）仅存量迁移探测/清理时读取与删除，正常写路径不再使用。

## Risks / Trade-offs

- **不可逆存量迁移（最高风险）**：删 localStorage 条目不可回退。缓解=D4 严格"先写成功再删"顺序 + 崩溃残留清理分支 + 幂等重入；QA 必须真机核验"saveNovel 成功后才删条目""失败保留""崩溃残留被清理"三条路径。
- **迁移触发语义（IMPORTANT）**：必须用"字段 undefined"而非"字段为空"作触发条件，否则合法空成果被 localStorage 覆盖、或 sanitizeNovel 补空对象致迁移永不触发。D2/D3 已锁死。
- **schema BREAKING**：v5→6 四副本不同步会导致主/渲染类型漂移。缓解=四副本逐一核对 + build 双端 tsc 通过。
- **双迁移轨耦合**：sanitizeNovel 保持 undefined（主进程）与 renderer 搬运（渲染进程）时序——sanitizeNovel 先跑，renderer 拿到字段仍 undefined 的对象，再探测 localStorage 搬运。顺序天然正确，无需额外协调。
- **坏数据容错**：解析失败不阻断加载、不删、不写，属保守策略；坏条目会持续存在直到用户重新分析产生合法字段——可接受。
- **字段体积**：图谱/情感曲线数据进 Novel 会增大单本 novel.json；属预期成本（成果本应随作品走），无截断。

```

## openspec/changes/persist-emotion-graph/tasks.md

- Source: openspec/changes/persist-emotion-graph/tasks.md
- Lines: 1-34
- SHA256: 3e9085cee985ed0b035aa779224b58c5ae4e6797e557e851d1c5fbf2a0ab9b66

```md
## 1. Schema 扩展（v5→6，四副本同步）

- [ ] 1.1 `src/types/novel.ts`：`Novel` 新增 `emotionArc?` / `characterGraph?` 两字段（可选，缺省 undefined）；`EmotionArc` / `CharacterGraph` 类型定义纳入 schema（从 emotionArc.ts / 图谱模块提升或 re-export）；NOVEL_SCHEMA_VERSION 5→6
- [ ] 1.2 `electron/preload/bridgeTypes.ts`：同步新增两字段 + version 6
- [ ] 1.3 `electron/main/index.ts`：本地 Novel interface 副本同步两字段 + version 6
- [ ] 1.4 `src/services/rendererBridge.ts`：同步新增两字段 + version 6
- [ ] 1.5 四副本字段命名/可选性/类型逐一核对一致

## 2. 版本迁移消毒（主进程 sanitizeNovel）

- [ ] 2.1 `sanitizeNovel`：version 强制 6；`emotionArc`/`characterGraph` 字段类型校验，合法保留、**非法或缺失置 undefined，绝不合成任何空成果对象**——补空对象会使 renderer 迁移探测永不触发
- [ ] 2.2 v4/v5 老 Novel 经此保持字段缺省（undefined）、chapters/settings/foreshadowings 等原样保留（不读 localStorage、不搬运）

## 3. 存量数据惰性迁移（renderer 层）

- [ ] 3.1 触发条件严格为**字段 undefined**（非"字段为空"）：`novel.emotionArc === undefined` 且 localStorage `endless-creation.novel-emotion-arcs` 有该 novelId 条目 → 读出 → 结构校验 → 写入字段 → await saveNovel → 成功后删该 novelId 条目
- [ ] 3.2 图谱同理：`novel.characterGraph === undefined` 且 localStorage `endless-creation.novel-character-graphs` 有该 novelId 条目 → 同一"先写成功再删条目"流程
- [ ] 3.3 幂等 + 合法空成果保护：字段非 undefined（含 `points` 为空但仍含 `updatedAt` 的合法 `EmotionArc`，以及 `{ characters: [], relationships: [] }` 的合法 `CharacterGraph`）时跳过写入、不覆盖、不重复迁移；localStorage 无对应条目时不迁移、字段保持 undefined、不报错
- [ ] 3.4 崩溃残留清理：字段已有数据但该 novelId **可解析且结构合法**的旧条目仍存在（saveNovel 成功后、删除前曾崩溃）→ 不覆盖字段、直接删除该残留条目
- [ ] 3.5 坏数据容错优先：所有迁移/清理先解析并校验；localStorage 条目 JSON 解析失败或结构校验不通过 → 小说正常加载、保留旧条目不删、不写入 Novel 字段，即使 Novel 字段已有数据也不进入残留删除分支
- [ ] 3.6 数据安全：saveNovel 失败/中断时保留 localStorage、不删条目（下次加载可安全重试）；删除仅移除该 novelId 条目、不影响同键其他小说

## 4. 读写源切换（localStorage 写路径下线）

- [ ] 4.1 `emotionArc.ts`：getItem（:71）/ setItem（:92）改为读写 `novel.emotionArc`，upsert 经 saveNovel 落库
- [ ] 4.2 `NovelCreation.tsx` 图谱：`saveCharacterGraph`（:729/734/1302-1305）/ `readLocalStorage`（:1298）改为读写 `novel.characterGraph`，走 updateNovel 落库链
- [ ] 4.3 调用点核对：EmotionArcPanel、NovelCharacterGraph 面板存取改道到 Novel 字段；存储键常量（全名 `endless-creation.novel-emotion-arcs` / `endless-creation.novel-character-graphs`）仅迁移探测/清理时读删，正常写路径不再使用

## 5. 验证

- [ ] 5.1 `npm run build` 双端（renderer vite + electron tsc）通过
- [ ] 5.2 文本完整性扫描通过（`C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py`）；改动文件 U+FFFD 幻影字节 clean
- [ ] 5.3 `git diff --check` 干净
- [ ] 5.4 运行时/真机核验：新分析写 Novel 字段不写 localStorage；老 localStorage 数据加载即迁移进字段（字段 undefined 触发）；saveNovel 成功后删条目、失败保留；合法空成果不被覆盖；崩溃残留条目被清理；坏数据不阻断加载/不删/不写；导出 novel.json 含两字段；v4/v5 迁移不丢数据

```

## openspec/changes/persist-emotion-graph/specs/novel-analysis-persistence/spec.md

- Source: openspec/changes/persist-emotion-graph/specs/novel-analysis-persistence/spec.md
- Lines: 1-88
- SHA256: 4bd15e1ee4118950aea1d6174e9ead46d460daf33341c6b84da3a1203553b9a0

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 分析成果纳入 Novel schema

情感曲线与人物图谱 SHALL 作为 `Novel` 的字段（`emotionArc`、`characterGraph`）随小说本体持久化，经现有 `saveNovel` 保存并进入导出协议。加载 version 4 或 5 的旧小说时，系统 MUST 迁移到 version 6，为缺失字段保持缺省（undefined），且不丢失原有数据。

#### Scenario: 新分析结果写入 Novel 字段

- **WHEN** 用户完成一次情感曲线分析或人物图谱推演并确认
- **THEN** 结果写入对应的 `Novel` 字段并经 saveNovel 持久化
- **AND** 不再写入 localStorage

#### Scenario: 空成果是合法数据

- **WHEN** 用户产生一份内容为空但结构合法的成果（如 points 为空的合法 `EmotionArc`（仍含 `updatedAt`），或 `{ characters: [], relationships: [] }` 的 `CharacterGraph`）
- **THEN** 该字段被视为已有数据，予以持久化
- **AND** 后续加载不将其判定为可迁移、不被 localStorage 覆盖

#### Scenario: 旧版本小说迁移

- **WHEN** 加载一个 version 4 或 5 的旧小说
- **THEN** 小说被迁移为 version 6
- **AND** 缺失的 emotionArc 与 characterGraph 字段保持缺省（undefined），不被补成空对象
- **AND** 原有章节、设定、伏笔等数据完整保留

#### Scenario: 导出包含分析成果

- **WHEN** 用户导出已含情感曲线/图谱字段的小说离线包
- **THEN** 导出的 novel.json 包含 emotionArc 与 characterGraph 字段

### Requirement: localStorage 存量数据惰性迁移

对已存在于全局 localStorage（`endless-creation.novel-emotion-arcs` / `endless-creation.novel-character-graphs`）的历史数据，系统 SHALL 在 renderer 加载对应小说时惰性迁移。迁移触发条件 MUST 为**字段缺失（undefined）**——仅当 `Novel` 对应字段为 undefined 且 localStorage 存在该 `novelId` 的数据时，才将其写入字段并经 saveNovel 持久化。字段已有数据（含合法空成果）时 MUST NOT 覆盖、MUST NOT 重复迁移。

#### Scenario: 老用户数据迁移进 Novel

- **WHEN** 加载一本对应字段为 undefined、且 localStorage 有该 novelId 情感曲线/图谱数据的小说
- **THEN** 系统将 localStorage 数据写入对应 Novel 字段
- **AND** 经 saveNovel 持久化

#### Scenario: 字段已有数据不覆盖

- **WHEN** 加载一本对应字段已有数据（含合法空成果，字段非 undefined）的小说
- **THEN** 系统不从 localStorage 覆盖该字段
- **AND** 不重复迁移

#### Scenario: 无历史数据的小说

- **WHEN** 加载一本 localStorage 无对应 novelId 数据的小说
- **THEN** 系统不执行迁移
- **AND** 字段保持缺省（undefined）、不报错

#### Scenario: 损坏的旧数据容错

- **WHEN** 加载小说时 localStorage 对应键 JSON 解析失败或结构校验不通过
- **THEN** 小说正常加载
- **AND** 保留该 localStorage 旧条目、不删除
- **AND** 不写入 Novel 字段

### Requirement: 迁移的数据安全顺序

存量迁移 SHALL 遵循"先写成功、再删旧数据"：仅当 `saveNovel` 成功落盘后，系统才 MAY 删除对应的 localStorage 条目。若 saveNovel 失败或迁移中断，系统 MUST 保留 localStorage 数据、不删除。

删除动作 MUST 以"先解析校验、再决定去留"为前置门，以消解与损坏容错的冲突：处理任一 novelId 的 localStorage 条目时，系统 SHALL 先尝试解析与结构校验——**解析/校验失败的条目一律保留、绝不删除**（无论字段是否已有数据）；仅**可成功解析**的条目才进入删除判定。为处理"saveNovel 成功后、删除前崩溃"的残留，当字段已有数据且该 novelId 的**可解析**旧条目仍存在时，系统 SHALL 不覆盖字段、仅清理该残留条目。删除 SHALL 仅移除该 novelId 条目，不影响同一存储键下其他小说的数据。

#### Scenario: 迁移成功后清除 localStorage

- **WHEN** 存量数据成功写入 Novel 字段且 saveNovel 落盘成功
- **THEN** 系统删除该 novelId 在 localStorage 中的对应条目
- **AND** 同一存储键下其他小说的条目不受影响

#### Scenario: 迁移失败保留 localStorage

- **WHEN** 存量迁移过程中 saveNovel 失败或中断
- **THEN** 系统保留 localStorage 中的原数据，不删除
- **AND** 不丢失用户已分析的成果

#### Scenario: 崩溃后残留条目清理

- **WHEN** 加载一本对应字段已有数据、但 localStorage 仍存在该 novelId **可解析**旧条目的小说（迁移成功落盘后、删除前曾崩溃）

```

Full source: openspec/changes/persist-emotion-graph/specs/novel-analysis-persistence/spec.md
