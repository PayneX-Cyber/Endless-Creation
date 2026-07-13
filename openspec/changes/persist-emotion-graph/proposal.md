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
