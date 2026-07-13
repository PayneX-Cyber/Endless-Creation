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
- **THEN** 系统不覆盖 Novel 字段
- **AND** 直接删除该 novelId 的残留 localStorage 条目

#### Scenario: 字段已有但残留条目损坏

- **WHEN** 加载一本对应字段已有数据、但该 novelId 的 localStorage 残留条目解析或结构校验失败的小说
- **THEN** 系统不覆盖 Novel 字段
- **AND** 保留该损坏残留条目、不删除（解析失败一律不删优先于残留清理）
