# Brainstorm Summary

- Change: add-novel-volume-structure
- Date: 2026-07-14

## 确认的技术方案

在 open 阶段 design.md（D1-D8）高层框架基础上，brainstorming 深化并锁定以下实现级技术决策：

### T1：章序契约（单一事实源）— 对应 open 决策 A
- `orderedChapters(novel): Chapter[]` 是全书章节顺序的**唯一权威来源**，返回按卷序展开的纯 `Chapter[]`，不原地修改 Novel。
- **全局章号 = 该章在 `orderedChapters` 结果中的 `index + 1`**；禁止再用 `chapter.order + 1` 表示全书章号。
- **前后关系 / 前文筛选 = 对 `orderedChapters` 结果切片**（前文上下文 = `ordered.slice(0, currentIndex)`）；禁止再用 `chapter.order < currentChapter.order` 判断先后。
- `chapter.order` 降级为**纯组内排序键**（每分组从 0 连续），只在展开函数内部消费，不对外表达全书语义。
- 拒绝 B 方案（`{chapter, globalIndex}[]` 包装）：globalIndex 已隐含在有序数组位置，包装是重复状态。

已核实的消费点改造映射（Grep 实证）：
- `novelExport.ts:118/146` `第 ${chapter.order+1} 章` → 取 `orderedChapters` 的 `index+1`
- `novelPrompts.ts:539` `order < currentChapter.order ... sort` 前文筛选 → `ordered.slice(0, currentIndex)`
- `novelPrompts.ts:448` 现用原始 `novel.chapters` 的 `index+1` → 换成 `orderedChapters` 的 index
- `characterGraph.ts:46` / `emotionArc.ts:30`：遍历+按 id 建集，与顺序无关，D3 已豁免不强改

### T2：结构调整不打断编辑会话 — 对应删卷激活章边界，选 A
- 删除卷、卷排序、章节归卷/跨卷移动等纯结构操作，只改 `volumeId` 与 `order`，`activeChapterId` 恒定保持。
- 正文、光标、编辑器撤销/重做历史栈、保存状态均不因结构调整重置。
- 删卷后被移入未分卷的激活章节仍是同一 `chapterId`，编辑不中断。
- **技术约束**：`ChapterWorkbench` 有自建撤销/重做历史栈（切章清栈）；纯结构操作不等于切章，MUST NOT 触发切章清栈逻辑。（Design Doc 风险节点名，实现时验收）

### T3：拖拽是增强，键盘路径是保证 — 拖拽技术选型，选 C策略+A技术
- 用 HTML5 原生 `draggable`/`onDragStart/onDragOver/onDrop` 实现卷内换位与跨卷拖入，**零新增依赖**。
- 所有结构操作 MUST 能仅通过键盘路径完成：上下移按钮做卷内重排，带 aria-label 的卷归属选择控件做跨卷移动。
- 拖拽不可用（触屏、辅助技术）时功能不缺失。
- 三种入口（拖拽/按钮/归属控件）共用同一组结构变更纯函数，不得出现两套 order 语义。

### T4：模块边界（瘦身原则）— 纯函数模块放置，选 B
- `novelStructure.ts`（纯 .ts）：承载**全部**纯数据函数——`orderedChapters` / `groupChaptersByVolume` / `moveChapterInStructure` / `reorderVolumes` / `deleteVolume` / 卷 CRUD / order 归一。无 React 依赖，ASCII 友好，可 tsc 独立验证。
- **一个** UI 组件 `.tsx`（如 `VolumeOutline.tsx`）：承接卷管理头部 + 按卷分组的章节列表 + 拖拽/键盘交互。不再拆一串小组件。
- 中文文案放该小 UI 文件内或独立 labels 文件；巨型 `NovelCreation.tsx` 只做状态接线和回调传递，不写卷逻辑。
- `ChapterWorkbench.tsx` 左栏导航改为**只读**卷分组展示（不含卷 CRUD），复用 `groupChaptersByVolume` 结果。
- 依据：项目现有约定"纯逻辑 .ts + 组件 .tsx"（emotionArc.ts vs EmotionArcPanel.tsx）；规避大 tsx Read 幻影字节风险。

## 关键取舍与风险

- **排序消费者遗漏** → 以 `orderedChapters` 为唯一入口；构建前扫描剩余直接全局 order 排序点（已实证 novelExport/novelPrompts 两处两套章号语义），逐项验收。
- **纯结构操作误触发切章清栈** → 明确区分"结构调整"与"切章"，前者不重置编辑会话。
- **v7 组内 order 与 v6 全局 order 不兼容** → 回滚代码前先按 `orderedChapters` 展平并重写全局 order。
- **孤儿 volumeId** → 消毒时只保留匹配现有卷的 id，其余归未分卷。
- **大 tsx 文件（ChapterWorkbench/NovelCreation）Read 渲染幻影字节** → 只用 Grep + tsc 定位/验证，改动锚 ASCII-only 行，禁 sed 多行插入。

## 测试策略

- 结构纯函数沿用项目现有自检模式（不新增测试依赖），至少覆盖：v6 未分卷迁移、正式卷顺序、未分卷末尾、组内 order 归一、跨卷移动双侧归一、删除卷不删章、无效 volumeId 降级、章号跟随卷序。
- 交付运行：双端 build（renderer tsc+Vite / Electron tsc）、文本完整性扫描（TEXT INTEGRITY OK）、`git diff --check`。
- GUI 真机验收：卷 CRUD/确认删除、卷排序、归卷/移出/跨卷、拖拽+键盘双路径、未分卷末尾、重启持久化、搜索章号及导出/Prompt/统计/图谱顺序一致。

## Spec Patch

**已确认补充（选 A）**：回写 `specs/novel-volume-structure/spec.md`，在 ADDED Requirements 新增 1 个 Requirement + 2 个 Scenario：

### Requirement: 纯结构调整不中断编辑会话
卷的删除、排序，以及章节归卷、移出卷、跨卷移动等纯结构操作，MUST NOT 改变当前激活章节（activeChapterId）、正文内容、光标位置、编辑器撤销/重做历史或保存状态。系统 MUST 仅更新受影响的 volumeId 与 order。

- Scenario: 归卷/跨卷移动时保持编辑会话 —— 编辑中移动该章，仍为激活章节，正文/光标/撤销重做不变，仅 volumeId 与分组 order 更新，仅导航分组位置变化。
- Scenario: 删除激活章节所在卷后继续编辑 —— 激活章所属卷被删，该章移入未分卷且仍为激活章节，chapterId/正文/光标/历史不变，可继续编辑。

其余 3 份 delta spec 场景已完整，不再改动。Spec Patch 仅补验收场景，不改结构范围。
