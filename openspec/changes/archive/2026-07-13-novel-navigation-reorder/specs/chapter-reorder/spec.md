## ADDED Requirements

### Requirement: 章节重排交互

系统 SHALL 为章节列表提供拖拽与上移/下移按钮两种入口来调整章节顺序。任一入口完成一次顺序调整后，系统 MUST 立即将新顺序反映在列表上。

#### Scenario: 上移章节

- **WHEN** 用户对某个非首章点击"上移"
- **THEN** 该章与其前一章交换顺序
- **AND** 列表按新顺序显示

#### Scenario: 下移章节

- **WHEN** 用户对某个非末章点击"下移"
- **THEN** 该章与其后一章交换顺序
- **AND** 列表按新顺序显示

#### Scenario: 边界禁用

- **WHEN** 章节位于列表首位
- **THEN** 其"上移"不可用
- **AND** 末位章节的"下移"不可用

#### Scenario: 拖拽到新位置

- **WHEN** 用户将某章拖拽并放置到另一位置
- **THEN** 该章移动到目标位置，其余章节顺序相应调整
- **AND** 列表按新顺序显示

### Requirement: 重排后 order 归一化与持久化

一次重排后，系统 SHALL 将所有章节的 `order` 字段重写为从 0 起的连续整数（复用现有删除章节时的归一化范式），并经现有 `updateNovel` → `saveNovel` 链自动保存。系统 MUST NOT 新增 IPC 通道或修改 schema。

#### Scenario: 重排后自动保存并跨会话保留

- **WHEN** 用户调整章节顺序后关闭并重新打开该小说
- **THEN** 章节以调整后的顺序显示

#### Scenario: order 消费者跟随新顺序

- **WHEN** 章节顺序被调整
- **THEN** 导出、前文上下文 prompt、统计与图谱等按 `order` 排序的消费方均按新顺序生效
- **AND** 无需用户额外操作
