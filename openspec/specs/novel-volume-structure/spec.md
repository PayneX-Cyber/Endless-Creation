# novel-volume-structure Specification

## Purpose
TBD - created by archiving change add-novel-volume-structure. Update Purpose after archive.
## Requirements
### Requirement: 卷数据模型与 v6→v7 兼容迁移

系统 SHALL 将小说 schema 升级为 version 7，为 `Novel` 增加 `volumes: Volume[]`，并为 `Chapter` 增加可选 `volumeId`。章节 MUST 继续保存在扁平 `Novel.chapters[]` 中，既有 `chapterId`、`chapter.content` 及其业务引用 MUST 保持不变。

#### Scenario: 新建小说初始化卷结构

- **WHEN** 用户新建一部小说
- **THEN** 系统创建 version 7 的 Novel
- **AND** `volumes` 初始化为空数组
- **AND** 不自动创建任何默认卷

#### Scenario: 加载 v6 老小说

- **WHEN** 系统加载一部 version 6 且没有 `volumes` 与 `volumeId` 的小说
- **THEN** 系统将其归一为 version 7
- **AND** 所有老章节保持原有相对顺序并进入“未分卷”
- **AND** 不虚构“第一卷”或其他卷

#### Scenario: 卷数据缺失或损坏

- **WHEN** 小说的 `volumes` 缺失、不是数组或包含非法卷条目
- **THEN** 系统丢弃非法条目并得到可用的卷数组
- **AND** 引用不存在卷的章节进入“未分卷”
- **AND** 小说仍可正常加载和编辑

#### Scenario: 章节锚点保持稳定

- **WHEN** 小说从 v6 迁移到 v7 或章节在卷之间移动
- **THEN** 章节 id、正文、大纲、版本历史、伏笔引用、情感曲线点与分析持久化引用均不被重建或改写

### Requirement: 统一卷序展开

系统 SHALL 通过统一顺序规则展开章节：正式卷按 `Volume.order` 升序，各卷内章节按 `Chapter.order` 升序，未分卷章节按自身 `Chapter.order` 升序并恒定排在所有正式卷之后。所有依赖章节先后关系的功能 MUST 使用同一展开结果。

#### Scenario: 正式卷与卷内章节排序

- **WHEN** 小说包含多个正式卷且各卷包含多个章节
- **THEN** 系统先按卷 order 排列正式卷
- **AND** 再按每个卷内的 chapter order 排列章节

#### Scenario: 未分卷恒定居末

- **WHEN** 小说同时包含正式卷章节与未分卷章节
- **THEN** 所有未分卷章节显示在最后一个正式卷之后
- **AND** 未分卷章节之间按自身 order 排列

#### Scenario: 顺序消费者保持一致

- **WHEN** 卷顺序、章节归属或卷内章节顺序发生变化
- **THEN** 项目导航、工作台导航、跨章搜索、导出、Prompt 前文上下文、统计、情感曲线与人物图谱均使用相同章节顺序
- **AND** 同一章节在各功能中的章号保持一致

### Requirement: 卷创建、重命名、排序与安全删除

系统 SHALL 在小说项目中提供卷的创建、重命名、上移、下移和删除。卷的 `order` MUST 在变更后归一为从 0 起的连续整数。删除卷 MUST NOT 删除任何章节或正文。

#### Scenario: 新建卷

- **WHEN** 用户输入非空卷名并创建卷
- **THEN** 新卷追加到所有正式卷末尾
- **AND** 系统通过现有整本 Novel 保存链持久化该卷

#### Scenario: 重命名卷

- **WHEN** 用户将卷标题修改为去除首尾空白后仍非空的文本
- **THEN** 系统更新卷标题和更新时间
- **AND** 分组导航立即显示新标题

#### Scenario: 调整卷顺序

- **WHEN** 用户上移或下移一个非边界卷
- **THEN** 该卷与相邻卷交换顺序
- **AND** 所有卷的 order 归一为连续整数
- **AND** 章节展开顺序立即跟随新卷序

#### Scenario: 安全删除非空卷

- **WHEN** 用户确认删除一个包含章节的卷
- **THEN** 系统删除卷元数据
- **AND** 将该卷全部章节的 `volumeId` 清空并移入“未分卷”
- **AND** 不删除或清空任何章节正文

#### Scenario: 取消删除卷

- **WHEN** 用户在删除卷确认中选择取消
- **THEN** 卷、章节归属和章节内容均保持不变

### Requirement: 章节归卷与跨卷移动

系统 SHALL 允许用户把章节归入正式卷、移入“未分卷”或移动到另一正式卷。每次移动后，源分组和目标分组的 `Chapter.order` MUST 分别归一为从 0 起的连续整数，并通过现有 Novel 保存链持久化。

#### Scenario: 未分卷章节归入正式卷

- **WHEN** 用户为一个未分卷章节选择目标卷
- **THEN** 系统设置该章节的 `volumeId`
- **AND** 将章节放入目标卷的确定位置
- **AND** 归一目标卷内章节 order

#### Scenario: 章节移出卷

- **WHEN** 用户将正式卷内章节的归属改为“未分卷”
- **THEN** 系统清空该章节的 `volumeId`
- **AND** 将章节放入未分卷区
- **AND** 分别归一原卷与未分卷区的章节 order

#### Scenario: 章节跨卷移动

- **WHEN** 用户把章节从一个正式卷移动到另一个正式卷
- **THEN** 系统更新该章节的 `volumeId`
- **AND** 分别归一源卷和目标卷的章节 order
- **AND** 章节 id 与正文保持不变

#### Scenario: 重启后归属保留

- **WHEN** 用户完成章节归卷或跨卷移动后关闭并重新打开小说
- **THEN** 卷、章节归属和组内顺序与关闭前一致

### Requirement: 卷分组管理与导航 UI

系统 SHALL 在“章节大纲”页提供可用的卷管理与章节归属界面，并在项目章节列表和工作台章节导航中按统一卷序分组显示。跨卷移动 MUST 同时具备指针操作路径和可键盘操作路径。

#### Scenario: 大纲页显示完整分组

- **WHEN** 用户打开小说项目的“章节大纲”页
- **THEN** 系统按正式卷顺序显示卷标题和卷内章节
- **AND** 在最后显示可放置章节的“未分卷”区
- **AND** 提供卷 CRUD、卷排序与章节归属控件

#### Scenario: 工作台按卷导航

- **WHEN** 用户进入章节工作台
- **THEN** 左侧章节导航按正式卷和未分卷区分组
- **AND** 点击任一章节仍以原 chapterId 激活对应正文

#### Scenario: 跨卷移动的键盘路径

- **WHEN** 用户无法或不使用拖拽
- **THEN** 用户可通过带可访问标签的卷归属选择控件完成归卷、移出卷或跨卷移动

#### Scenario: 卷操作可达性

- **WHEN** 用户使用辅助技术或键盘操作卷管理界面
- **THEN** 卷上移、下移和删除按钮具有明确的可访问名称
- **AND** 边界位置的无效移动按钮处于禁用状态

### Requirement: 卷结构复用现有持久化链

卷 CRUD、卷排序、章节归属与章节重排 SHALL 在 renderer 中更新整本 Novel，并复用现有 `saveNovel(novel)` 持久化链。系统 MUST NOT 为卷管理新增专用 IPC 通道，搜索与分组展示 MUST NOT 产生额外持久化写入。

#### Scenario: 卷变更自动保存

- **WHEN** 用户完成任一卷结构变更
- **THEN** 系统把当前 Novel 标记为待保存
- **AND** 经现有自动保存链写入完整 Novel

#### Scenario: 无新增卷 IPC

- **WHEN** 系统执行新建卷、重命名卷、卷排序、删除卷或章节归卷
- **THEN** 操作通过现有整本 Novel 保存接口完成
- **AND** 不调用任何卷专用 IPC

#### Scenario: NovelSummary 保持现状

- **WHEN** 系统列出小说项目摘要
- **THEN** 摘要继续提供既有字段
- **AND** 不新增 `volumeCount`

### Requirement: 纯结构调整不中断编辑会话

卷的删除、排序，以及章节归卷、移出卷、跨卷移动等纯结构操作，MUST NOT 改变当前激活章节（activeChapterId）、正文内容、光标位置、编辑器撤销/重做历史或保存状态。系统 MUST 仅更新受影响的 `volumeId` 与 `order`。

#### Scenario: 归卷/跨卷移动时保持编辑会话

- **WHEN** 用户在编辑某章正文的过程中，将该章移入其他卷、移出卷或跨卷移动
- **THEN** 该章仍为当前激活章节，正文、光标位置与撤销/重做历史保持不变
- **AND** 仅其 `volumeId` 与所在分组的 `order` 更新
- **AND** 仅导航中的分组位置发生变化

#### Scenario: 删除激活章节所在卷后继续编辑

- **WHEN** 用户当前激活章节所属的卷被删除
- **THEN** 该章节移入“未分卷”且仍为激活章节
- **AND** 其 `chapterId`、正文、光标与编辑器历史不变，用户可继续编辑

