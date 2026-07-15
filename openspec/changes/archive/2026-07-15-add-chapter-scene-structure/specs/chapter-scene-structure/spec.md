## ADDED Requirements

### Requirement: 场景数据模型与 v7→v8 兼容迁移

系统 SHALL 将小说 schema 升级为 version 8，为 `Chapter` 增加 `scenes: Scene[]`，并删除 `Chapter.content` 字段。正文权威模型 MUST 下沉为 `Scene.content`。既有 `chapterId` 及其业务引用（伏笔、情感点、人物图谱）MUST 保持不变，本 change MUST NOT 新增任何持久化的 `sceneId` 业务锚点。

#### Scenario: 有正文章节迁移到默认场景

- **WHEN** 系统加载一部 version 7 且某章含 `content`、`versions[]`、`selectedVersionId` 的小说
- **THEN** 系统将该章归一为 version 8，并创建恰好一个默认场景
- **AND** 该章的 `content`、`versions[]`、`selectedVersionId` 原样迁入该默认场景
- **AND** 章上的 `content` 字段被移除

#### Scenario: 空章节迁移到空默认场景

- **WHEN** 系统加载一部 version 7 且某章 `content` 为空的小说
- **THEN** 系统为该章创建一个 `content` 为空串的默认场景
- **AND** 不虚构场景标题（持久化标题留空）

#### Scenario: 场景数据缺失或损坏

- **WHEN** 章节的 `scenes` 缺失、不是数组或包含非法场景条目
- **THEN** 系统丢弃非法条目
- **AND** 若清理后该章没有任何场景，系统补建一个空默认场景，保证每章至少一个场景
- **AND** 小说仍可正常加载和编辑

#### Scenario: 章节锚点保持稳定

- **WHEN** 小说从 v7 迁移到 v8 或场景在章内增删/排序
- **THEN** 章节 id、伏笔引用、情感曲线点与人物图谱引用均不被重建或改写
- **AND** 分析输入按该章场景顺序聚合正文，锚点粒度保持 chapter 级

### Requirement: 每章至少一个场景不变量

系统 SHALL 在迁移、新建章节与删除场景所有路径上保证每个章节恒定至少包含一个场景（`chapter.scenes.length >= 1`）。编辑器 MUST NOT 需要处理零场景章节的分支。

#### Scenario: 新建章节初始化默认场景

- **WHEN** 用户新建一个章节
- **THEN** 系统为该章初始化恰好一个空默认场景
- **AND** 复用与迁移一致的默认场景初始化逻辑

#### Scenario: 禁止删除最后一个场景

- **WHEN** 某章仅剩一个场景
- **THEN** 该场景的删除操作不可用
- **AND** 章节始终保留至少一个场景

### Requirement: 统一场景展开

系统 SHALL 通过 `orderedScenes(chapter)` 按 `Scene.order` 升序展开章内场景，作为章内正文与场景顺序的唯一入口。所有依赖章内正文或场景先后关系的功能 MUST 使用同一展开结果。展开 MUST NOT 原地修改传入的 chapter/novel。

#### Scenario: 场景按 order 展开

- **WHEN** 某章包含多个场景
- **THEN** 系统按 `Scene.order` 升序返回场景
- **AND** order 相同时以原数组位置稳定兜底

#### Scenario: 章内正文聚合

- **WHEN** 任一功能需要整章正文（导出、字数、Prompt 上下文、分析输入）
- **THEN** 该功能按 `orderedScenes(chapter)` 顺序聚合各场景 `content`
- **AND** 聚合结果与场景展示顺序一致

#### Scenario: 顺序消费者保持一致

- **WHEN** 场景顺序或场景正文发生变化
- **THEN** 导出、字数/进度、Prompt 前文上下文、分析输入与搜索均使用相同的章内场景顺序

### Requirement: 场景创建、重命名、排序与安全删除

系统 SHALL 在章节工作台提供场景的创建、重命名、上移、下移与删除。场景的 `order` MUST 在变更后归一为从 0 起的连续整数。所有场景结构操作 MUST 返回新的 Novel（不原地修改），并经现有 `saveNovel(novel)` 链持久化。

#### Scenario: 新建场景

- **WHEN** 用户在某章新建场景
- **THEN** 新场景追加到该章场景末尾
- **AND** 系统通过现有整本 Novel 保存链持久化

#### Scenario: 重命名场景

- **WHEN** 用户将场景标题修改为去除首尾空白后仍非空的文本
- **THEN** 系统更新场景标题
- **AND** 场景导航立即显示新标题

#### Scenario: 调整场景顺序

- **WHEN** 用户上移或下移一个非边界场景
- **THEN** 该场景与相邻场景交换顺序
- **AND** 该章所有场景 order 归一为连续整数
- **AND** 边界场景的越界移动按钮处于禁用状态

#### Scenario: 删除非末尾场景

- **WHEN** 某章存在多个场景，用户删除其中一个
- **THEN** 系统删除该场景及其正文与版本
- **AND** 该章剩余场景 order 归一为连续整数

### Requirement: 分场景编辑与撤销栈隔离

系统 SHALL 以 `activeSceneId` 作为实际编辑目标，用户切换场景即切换编辑的正文。撤销/重做历史 MUST 按 `sceneId` 隔离；切换场景、场景排序或删除场景 MUST NOT 使撤销栈跨场景串栈。`activeChapterId` 与 `activeSceneId` 均为会话态，MUST NOT 持久化。

#### Scenario: 切换场景切换编辑目标

- **WHEN** 用户在某章内点击另一个场景
- **THEN** 编辑器加载该场景的 `content` 作为编辑目标
- **AND** `activeSceneId` 更新为该场景

#### Scenario: 撤销栈按场景隔离

- **WHEN** 用户在场景 A 编辑后切换到场景 B
- **THEN** 场景 A 的撤销历史不再对场景 B 生效
- **AND** 在场景 B 按撤销不会回退到场景 A 的正文

#### Scenario: 删除当前场景后激活相邻场景

- **WHEN** 用户删除当前激活的场景（该章仍有其他场景）
- **THEN** 系统仅清除该场景的撤销历史
- **AND** 激活相邻场景作为新的编辑目标

#### Scenario: 重启默认激活首章首场景

- **WHEN** 用户关闭并重新打开小说
- **THEN** 系统默认激活首章的首个场景
- **AND** 不依赖任何持久化的编辑落点字段

### Requirement: 场景级版本历史与 AI 续写

系统 SHALL 将 `ChapterVersion` 快照、版本预览、版本写回与 AI 流式续写全部下沉为场景粒度，作用于当前激活场景的 `Scene.content`。版本历史容量上限沿用现有单目标上限语义。

#### Scenario: AI 续写落到当前场景

- **WHEN** 用户在某场景触发 AI 续写
- **THEN** 流式生成结果写入当前激活场景的 `content`
- **AND** 不影响同章其他场景的正文

#### Scenario: 版本快照与写回按场景

- **WHEN** 用户为当前场景保存或预览版本、或选择某个历史版本写回
- **THEN** 版本快照与写回仅作用于该场景的 `content`
- **AND** 场景各自维护独立的版本列表与 selectedVersionId

### Requirement: 场景结构复用现有持久化链

场景 CRUD、排序与正文编辑 SHALL 在 renderer 中更新整本 Novel，并复用现有 `saveNovel(novel)` 持久化链。系统 MUST NOT 为场景管理新增专用 IPC 通道，MUST NOT 新增第三方依赖。

#### Scenario: 场景变更自动保存

- **WHEN** 用户完成任一场景结构变更或正文编辑
- **THEN** 系统把当前 Novel 标记为待保存
- **AND** 经现有自动保存链写入完整 Novel

#### Scenario: 无新增场景 IPC

- **WHEN** 系统执行新建场景、重命名、排序、删除场景或场景正文写入
- **THEN** 操作通过现有整本 Novel 保存接口完成
- **AND** 不调用任何场景专用 IPC
