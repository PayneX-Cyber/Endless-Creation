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
