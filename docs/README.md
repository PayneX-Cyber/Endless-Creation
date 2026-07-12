# Endless Creation 文档导航

本文是仓库文档的统一入口。最后整理日期：2026-07-12。

## 事实源

按以下优先级判断当前状态：

1. 当前代码与 Git 提交。
2. [V1.0 执行路线图](plans/2026-07-06-v1-roadmap-adjusted.md)。
3. OpenSpec 主规格与活动变更。
4. 已完成的设计、实施计划和 QA 记录。
5. 旧迁移计划与差距分析仅作历史参考。

## 新工作流

```text
需求
  -> openspec/changes/<change>/      WHAT：proposal、delta spec、tasks
  -> docs/superpowers/specs/         HOW：技术设计
  -> docs/superpowers/plans/         HOW：实施计划
  -> docs/qa/                        VERIFY：验收记录
  -> openspec/specs/                 ARCHIVE：归档后的当前规格
```

- Comet 负责阶段流转与状态守卫。
- OpenSpec 负责需求、规格和变更归档。
- Superpowers 负责技术设计、实施计划和执行方法。
- 历史文档不批量迁移进 OpenSpec；从下一项新变更开始使用新结构。

## 当前状态

- V1 Beta 收口、AI usage 持久化和情感曲线均已完成并推送。
- Phase 4 商业化仍后置；情感曲线只解除其中一项门槛。
- 当前没有活动 OpenSpec change。
- [AI 工作流治理与防腐化基建设计](superpowers/specs/2026-07-12-ai-workflow-governance-design.md) 已批准，等待建立 OpenSpec change 和实施计划。
- 下一阶段优先做内部全链路狗粮验证，不把内部验证冒充真实种子用户反馈。

## 架构

| 文档 | 用途 | 状态 |
| --- | --- | --- |
| [Adapter 边界](architecture/adapter-boundaries.md) | v0.1 adapter 与 provider 边界 | 历史架构基线，细节可能落后于当前实现 |
| [AI 应用技术栈备忘](architecture/ai-app-stack-glossary.md) | 技术选型与引入顺序 | 参考 |

## 当前路线与研究

| 文档 | 用途 | 状态 |
| --- | --- | --- |
| [V1.0 执行路线图](plans/2026-07-06-v1-roadmap-adjusted.md) | 当前阶段门、实施台账和后置项 | 当前 |
| [小说创作迁移方案](plans/2026-06-30-novel-creation-migration-plan.md) | 六阶段迁移与参考项目记录 | 历史总纲 |
| [参考项目差距分析](plans/2026-07-09-novel-reference-gap-analysis.md) | 2026-07-09 能力快照 | 历史快照，矩阵不代表当前状态 |

## 已完成规格

### 小说基础链路

- [概念到正文生成链](plans/2026-07-02-novel-generation-chain-3a-spec.md)
- [灵感模式](plans/2026-07-02-novel-inspiration-mode-3a1-spec.md)
- [项目列表与项目查看](plans/2026-07-02-novel-workbench-project-view-3a2-spec.md)
- [章节创作工作台](plans/2026-07-02-novel-chapter-workbench-3a3-spec.md)
- [多版本章节草稿](plans/2026-07-03-novel-multi-version-3b-spec.md)

### 评审与优化

- [章节评审规格](plans/2026-07-03-novel-chapter-review-4a-spec.md)
- [章节评审实施方案](plans/2026-07-03-novel-chapter-review-4a-implementation.md)
- [选区优化规格](plans/2026-07-04-novel-selection-optimize-4b-spec.md)
- [选区优化计划](plans/2026-07-04-novel-selection-optimize-4b-plan.md)
- [一致性检查](plans/2026-07-04-novel-consistency-check-4c-spec.md)
- [节奏检查](plans/2026-07-04-novel-rhythm-check-4d-spec.md)
- [useAiCheck 重构规格](plans/2026-07-06-novel-useaicheck-refactor-spec.md)
- [useAiCheck 重构计划](plans/2026-07-06-novel-useaicheck-refactor-plan.md)

### 创作管理与导出

- [创作统计规格](plans/2026-07-05-novel-stats-overview-5b-spec.md)
- [创作统计计划](plans/2026-07-05-novel-stats-overview-5b-plan.md)
- [Markdown 文件导出规格](plans/2026-07-06-novel-export-markdown-file-5c-spec.md)
- [Markdown 文件导出计划](plans/2026-07-06-novel-export-markdown-file-5c-plan.md)
- [伏笔 CRUD 规格](plans/2026-07-06-novel-foreshadowing-crud-5d1-spec.md)
- [伏笔 CRUD 计划](plans/2026-07-06-novel-foreshadowing-crud-5d1-plan.md)
- [AI 伏笔候选规格](plans/2026-07-06-novel-foreshadowing-ai-candidates-5d2-spec.md)
- [AI 伏笔候选计划](plans/2026-07-06-novel-foreshadowing-ai-candidates-5d2-plan.md)

### 收口与体验

- [SSE 流式生成设计](plans/2026-07-09-novel-sse-streaming-design.md)
- [功能入口对齐规格](plans/2026-07-10-novel-feature-entry-alignment-spec.md)
- [功能入口对齐实施计划](superpowers/plans/2026-07-10-novel-feature-entry-alignment.md)
- [V1 Beta 加固规格](plans/2026-07-10-v1-beta-hardening-spec.md)
- [情感曲线规格](plans/2026-07-10-novel-emotion-arc-spec.md)
- [情感曲线实施计划](superpowers/plans/2026-07-10-novel-emotion-arc.md)

## QA

| 文档 | 用途 | 状态 |
| --- | --- | --- |
| [localStorage 隔离规则](qa/local-storage-isolation.md) | QA 不污染真实 Electron profile | 当前规则 |
| [P0 狗粮记录](qa/p0-dogfood-2026-07-09.md) | 早期主链路验收结果 | 历史记录 |
| [V1 Beta 收口复核](qa/v1-beta-closure-review-2026-07-09.md) | Beta 收口审查 | 历史记录 |
| [v0.1 框架清单](qa/v0.1-framework-checklist.md) | 初始框架验收 | 历史清单 |
| [v0.3 Electron 清单](qa/v0.3-electron-checklist.md) | Electron 壳验收 | 历史清单 |

## 文档维护规则

- 新能力不要继续堆进 `docs/plans/`；使用 OpenSpec change。
- OpenSpec 归档后，主规格进入 `openspec/specs/`。
- 技术设计和实施计划分别放 `docs/superpowers/specs/` 与 `docs/superpowers/plans/`。
- QA 结果放 `docs/qa/`，文件名带日期。
- 已完成文档保留，不删除，不把旧矩阵当作当前状态。
- 每次交付同步状态、提交号、验证结果和路线图。
