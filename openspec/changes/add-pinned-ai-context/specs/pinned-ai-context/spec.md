## ADDED Requirements

### Requirement: 钉选结构化设定与伏笔

用户 SHALL 能够从当前小说已有的结构化设定（`SettingEntry`）和伏笔（`Foreshadowing`）中，手动勾选（钉住）少量条目作为"固定上下文"。钉选与取消钉选 MUST 立即反映在界面上，并作为小说数据的一部分被保存。

#### Scenario: 钉选一条设定

- **WHEN** 用户在设定入口点击某条设定的钉选控件
- **THEN** 该设定被标记为已钉住，其 id 记入 `Novel.pinnedSettingIds`
- **AND** 界面显示该条为已钉住状态

#### Scenario: 钉选一条伏笔

- **WHEN** 用户在伏笔入口点击某条伏笔的钉选控件
- **THEN** 该伏笔被标记为已钉住，其 id 记入 `Novel.pinnedForeshadowingIds`
- **AND** 界面显示该条为已钉住状态

#### Scenario: 取消钉选

- **WHEN** 用户对一条已钉住的设定或伏笔点击取消钉选
- **THEN** 该条 id 从对应的 `pinnedSettingIds` / `pinnedForeshadowingIds` 中移除
- **AND** 界面恢复为未钉住状态

### Requirement: 钉选数量硬上限

系统 SHALL 对钉选总数（设定与伏笔合计）设置硬上限（默认 8 条）。达到上限后，系统 MUST 禁止继续钉选并给出明确提示；取消钉选后 MUST 恢复可继续钉选。

#### Scenario: 达到上限后禁止继续钉选

- **WHEN** 已钉选条目总数达到上限，用户尝试钉住新的一条
- **THEN** 系统不将新条目加入钉选
- **AND** 界面禁用继续钉选并提示"已达钉选上限"

#### Scenario: 取消钉选后恢复可钉

- **WHEN** 已达上限，用户取消钉住其中一条
- **THEN** 钉选总数减一
- **AND** 界面恢复允许钉住新条目

### Requirement: 钉选内容注入指定 AI 调用

系统 SHALL 在章节续写（`generateChapterBody` 对应的 prompt 构造）与一致性检查（`consistency` 对应的 prompt 构造）两处 AI 调用中，注入当前已钉住条目的内容作为固定上下文。系统 MUST NOT 在评审（review）、节奏检查（rhythm）、选区优化（optimize）三处注入。

#### Scenario: 续写注入钉选内容

- **WHEN** 用户在已有钉选的小说上触发章节续写
- **THEN** 续写 prompt 中包含每条已钉住且仍存在的设定/伏笔内容

#### Scenario: 一致性检查注入钉选内容

- **WHEN** 用户在已有钉选的小说上触发一致性检查
- **THEN** 一致性检查 prompt 中包含每条已钉住且仍存在的设定/伏笔内容

#### Scenario: 未注入的调用不受影响

- **WHEN** 用户触发评审、节奏检查或选区优化
- **THEN** 这些调用的 prompt 不包含钉选内容
- **AND** 其行为与本 change 之前一致

#### Scenario: 无钉选时不改变现有行为

- **WHEN** 小说没有任何钉选条目并触发续写或一致性检查
- **THEN** prompt 不包含固定上下文段
- **AND** 生成行为与本 change 之前一致

### Requirement: 悬空引用容错

当已钉住的设定或伏笔被删除后，系统 SHALL 在注入时按当前实际存在的条目过滤，跳过失效的 id。注入与生成 MUST NOT 因悬空引用而报错或中断。

#### Scenario: 已钉条目被删除后续写

- **WHEN** 一条已钉住的设定被删除，随后用户触发续写
- **THEN** 系统跳过该失效 id，仅注入仍存在的钉选条目
- **AND** 续写正常进行，不报错

### Requirement: 钉选状态持久化与迁移

钉选状态 SHALL 作为 `Novel` schema 的一部分（`pinnedSettingIds`、`pinnedForeshadowingIds`），随小说本体经现有 `saveNovel` 持久化并进入导出。加载 version 4 的旧小说时，系统 MUST 迁移到 version 5，为两个新字段补空数组，且不丢失原有数据。

#### Scenario: 钉选跨会话保留

- **WHEN** 用户钉选若干条目后关闭并重新打开该小说
- **THEN** 之前的钉选状态被完整保留

#### Scenario: 旧版本小说迁移

- **WHEN** 加载一个 version 4 的旧小说
- **THEN** 小说被迁移为 version 5
- **AND** `pinnedSettingIds` 与 `pinnedForeshadowingIds` 初始化为空数组
- **AND** 原有章节、设定、伏笔等数据完整保留
