---
comet_change: add-script-workbench
role: technical-design
canonical_spec: openspec
---

# 剧本工作台核心闭环 — 技术设计

> 本文是 OpenSpec open 阶段 `design.md`（高层框架）的深度技术细化。需求与验收场景以 `openspec/changes/add-script-workbench/specs/*/spec.md` 为准（canonical spec），本文只补实现方案、技术风险、测试策略与边界条件，不重述需求。

## Context

Endless Creation 产品定位覆盖“编剧、导演、小说作者”，当前只有小说创作闭环。侧边栏 `activeNavId === 'script-workbench'` 入口已存在于 `src/app/App.tsx` 导航配置，但没有对应路由分支，点击落到 `blank-workspace` 兜底。本 change 填充该入口，交付剧本创作核心闭环：建剧本 → 管集与场次 → 写场次纯文本正文 → 关联项目级人物/地点设定，全部本地落库并覆盖 Electron + Web fallback 双路径。

现有可复用基线（读源码确认，非假设）：

- **小说落库三件套**（`electron/main/index.ts`）：目录 per-entity（`userData/novels/<novelId>/novel.json`）+ 原子写（写 `novel.json.tmp` 再 `fs.rename`，index.ts:1045-1048）+ 按 id 串行保存队列（`novelSaveQueues: Map<string, Promise>`，index.ts:16、1041-1051）。删除前先 `await` 该 id 的 pending save（index.ts:1062）再 `fs.rm`。
- **关键事实**：小说在磁盘上**不按 projectId 分区**，全部平铺在 `novels/` 下，`projectId` 只是 `novel.json` 内字段；`listNovels` 读全部目录再按字段过滤（index.ts:968-984）。所谓“复用存储模式”复用的是上述三件套，不是磁盘分区方式。
- **双路径 bridge**（`src/services/rendererBridge.ts`）：有 Electron preload bridge 时走 IPC，否则走 Web localStorage fallback，两路返回同形状结果。`novelService` 是薄封装 service 层供 UI 调用。
- **正文权威载体**：小说 `Scene.content` 为纯文本正文唯一权威，新建保证“章必有 ≥1 场”不变量。
- **测试现状**：小说域**零单测**（codegraph 全程标注 no covering tests found），验收靠 build + 类型检查 + Electron 真机 GUI。仓库另有 `tools/ai-workflow/` 用 `node --test` 跑 `*.test.mjs`（package.json `test:ai-workflow`）。

约束：本地优先；不触及 `Novel`/`Chapter`/`Scene` 类型及其落库；不新增第三方**运行时**依赖；不修改或记录用户真实 API 密钥。

## Goals / Non-Goals

**Goals:**

- 填充 `script-workbench` 路由分支，接管既有侧边栏入口，传入 `activeProjectId`。
- 落地独立剧本域三层模型 `Script → Episode → ScriptScene`（`ScriptScene.content` 纯文本正文权威），新建剧本自动含第 1 集第 1 场。
- 落地项目级共享设定库 `SharedSettings`（按 `projectId` 空库起步，手动 CRUD 人物/地点），与 `Novel.settings` 完全隔离。
- 场次以 `referenceIds` 结构化引用共享设定，不把名称复制进正文。
- 统一删除模型（硬删除 + UI 即时撤销）与引用完整性保护（main 读盘扫描），覆盖 Electron + Web fallback 双路径。
- 为核心不变量（集/场增删改序、删除不变量、撤销快照重建、引用扫描）建立纯函数自动回归网。

**Non-Goals:**

- AI 续写/改写/版本历史、分镜拆解与生图/资产关联、Word/MD/ZIP 导出、Electron 全链路专项狗粮验收。
- 富文本剧本格式与对白/动作 block、正文内 `@` 引用标记、搜索/标签、拖拽排序。
- 回收站/软删除（`deletedAt`）与恢复 IPC。
- 小说设定导入迁移（后续单开 change，届时再定复制/转移/链接语义）。
- 项目本身的落库（项目中心沿用现有 `activeProjectId`）。
- 引入 vitest 或任何测试框架依赖；不建恒等迁移占位文件。

## Decisions

open 阶段已锁定 7 个高层决策（见 `openspec/changes/add-script-workbench/design.md` Decision 1-7：独立剧本域不复用 Novel / 存储模式复用业务域独立 / 共享设定空库不迁移 / 统一删除+撤销无 deletedAt / 引用完整性以磁盘为权威源 / 写盘失败不静默降级 / 单一编排层+单一保存链）。本文不重述，只钻实现层的 5 个新决策。

### D1. 磁盘布局按 projectId 分区（与小说域平铺不同，有意为之）

```
userData/
  scripts/
    <projectId>/
      <scriptId>/
        script.json          # 整棵 episodes → scenes → content 树
        script.json.tmp      # 原子写临时文件
  project-settings/
    <projectId>.json         # 该项目共享设定库整体
```

- **Script 单文件整树**：`script.json` 存整棵 `episodes → scenes → content`。不做 per-episode/per-scene 拆文件——那会破坏 Decision 7 的“整树保存 + 单一保存链”模型，属过度设计。对齐小说 `novel.json` 的单文件整树。
- **按 projectId 分区目录**：删设定完整性扫描（Decision 5）只需 `readdir(scripts/<projectId>)` 逐个解析扫 `referenceIds`，“当前项目”边界即目录边界，天然不碰其他项目文件，扫描范围与成本随项目内剧本数收敛。这是与小说域平铺的有意差异——小说域没有跨实体读盘扫描需求所以平铺够用，剧本域有此需求所以分区。
- **复用三件套**：目录 per-entity + 原子写（`script.json.tmp` → `fs.rename`）+ 按 scriptId 串行保存队列（新建独立的 `scriptSaveQueues: Map<string, Promise>`，不与 `novelSaveQueues` 混用）。设定库用按 projectId 的串行队列（`settingsSaveQueues`）。
- **备选**：全部平铺 + 字段过滤（小说现状）——放弃，删设定扫描要读全盘所有项目的 Script，跨项目开销且边界模糊。

### D2. schemaVersion 初值 = 1，只留校验骨架，不建恒等迁移文件

- `Script` 与 `ProjectSettingEntry` 容器均带 `schemaVersion: 1`。
- main 的 `readScriptFile`/`readSettingsFile` 保留 `if (parsed.schemaVersion !== 1) { /* 未来迁移 */ }` 校验骨架，对齐小说 `readNovelFile` 里 `version !== 8` 的 self-heal 写法（index.ts:996-1000）。
- 本 change **不创建** `scriptMigration.ts` 恒等占位文件——v1 只校验版本号，真正出现 v2 时再增加迁移函数与其单测。避免为不存在的迁移写空壳。

### D3. 测试用 Node 内置 `node --test`，不引入 vitest

- 保住 proposal Impact 的“无新增第三方依赖”。仓库已有 `test:ai-workflow` 先例（`node --test --test-concurrency=8 tools/ai-workflow/test/*.test.mjs`）。
- **已实测验证**（临时脚本跑通即删）：`.mjs` 测试文件可直接 `import` `.ts` 纯函数源模块，Node v24.16 type-stripping 生效，`node --test` 正常收集并通过。存在 `MODULE_TYPELESS_PACKAGE_JSON` 无害警告（根 package.json 无 `"type":"module"`），不影响运行，不改根配置。
- 新增脚本 `test:script`（形如 `node --test src/features/script-workbench/*.test.mjs`），并入验收链。

### D4. 纯函数模块边界（测试策略反推的架构）

为让核心逻辑可单测，必须从 IPC handler 和 React 组件中抽出不依赖 Electron/DOM 的纯函数：

```
src/features/script-workbench/
  scriptDomain.ts        # 纯函数：建初始剧本树（含第1集第1场）、集/场增删改序、
                         #        删除不变量（不允许删到空）、撤销快照重建
  scriptDomain.test.mjs  # node --test：建树/改序/不变量/撤销重建
electron/main/
  scriptReferences.ts    # 纯函数：给定 Script[] 与 settingId，扫描并返回引用位置摘要
  scriptReferences.test.mjs  # node --test：命中/未命中/跨多场次/多剧本
```

- **UI 不自行扫描引用**：ReferencePanel/SharedSettingsPanel 展示“被引用”状态与删除拒绝原因时，只消费 main handler 返回的引用位置摘要，**不在渲染层重扫**。这把 Decision 5“磁盘为权威源”贯彻到 UI 层，堵死双份扫描逻辑漂移。渲染层展示当前场次已关联的 `referenceIds` 属于本地 draft 状态（用于勾选/取消），与“某设定被哪些场次引用”的完整性判定是两回事，后者只由 main 读盘得出。
- `scriptReferences.ts` 放在 `electron/main/` 下（main handler 直接 import），因为它是删除完整性的权威实现，归属主进程；`.mjs` 测试从该路径 import。
- handler 与组件变薄：main handler 只管 IO（读盘/原子写/串行队列）并调用纯函数；组件只管渲染与 draft 状态，落库经 service。

### D5. 撤销快照生命周期与 flush 时序

- **删除 Script 前先 load 完整树**：`ScriptLibraryPanel` 列表只持摘要，删除流程必须先 `scriptService.loadScript(scriptId)` 得到含 `episodes → scenes → content` 的完整树作为撤销快照，再执行硬删除。避免从精简摘要删除后撤销出丢正文的空壳。
- **撤销走同一 saveScript**：撤销即用快照调用 `scriptService.saveScript(snapshot)` 恢复原 `id` 与完整内容（saveScript 对不存在的 id 是 create 语义）。
- **UndoToast 绑定 workbench 生命周期**：撤销快照活在 ScriptWorkbench 内存。项目切换 / 路由离开触发 flush 时，撤销快照同时失效（清空 UndoToast 状态），避免恢复出错误 projectId 或落到 flush 后空隙。撤销是瞬时内存操作，不跨生命周期存活。

## 数据模型（类型草案）

独立于 `Novel`/`Chapter`/`Scene`，新增 `src/types/script.ts`：

```ts
export interface ScriptScene {
  id: string;
  title: string;          // 可空串，UI 派生“场景 N”
  content: string;        // 纯文本正文权威
  order: number;
  referenceIds: string[]; // 关联 ProjectSettingEntry.id，只存 ID
  createdAt: string;
  updatedAt: string;
}
export interface Episode {
  id: string;
  title: string;
  order: number;
  scenes: ScriptScene[];  // 不变量 length >= 1
  createdAt: string;
  updatedAt: string;
}
export interface Script {
  id: string;
  projectId: string;
  title: string;
  episodes: Episode[];    // 不变量 length >= 1
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
}
export type ProjectSettingType = 'character' | 'location';
export interface ProjectSettingEntry {
  id: string;
  projectId: string;
  type: ProjectSettingType;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}
// 设定库容器（落库单元），带独立 schemaVersion 迁移基线
export interface ProjectSettings {
  projectId: string;
  entries: ProjectSettingEntry[];
  schemaVersion: 1;
}
export type ScriptSummary = Pick<Script, 'id' | 'projectId' | 'title' | 'createdAt' | 'updatedAt'> & {
  episodeCount: number;
  sceneCount: number;
};
```

## 数据流

```
UI (ScriptWorkbench / 子组件)
  持有完整 Script draft，只经 service，不碰 IPC/localStorage
   │
   ▼
scriptService / projectSettingsService  (src/services/)
   │
   ▼
rendererBridge  (双路径)
   ├─ Electron：preload script/projectSettings namespace → main IPC handler
   │             → scriptDomain/scriptReferences 纯函数 + 原子写 + 串行队列 → JSON 文件
   └─ Web：endless-creation.scripts.<projectId> / project-settings.<projectId> localStorage（同形状结果）
```

- 结构操作（改名/排序/增删集与场）与正文防抖编辑都是对同一 draft 的写入，统一由一条保存链（`saveScript` 整树）落盘，共用按 scriptId 串行队列——消除“改名立即存”被“正文防抖存旧 draft”覆盖的竞态（Decision 7）。
- 防抖窗口对齐小说编辑器现值。

## Risks / Trade-offs

- **[整树保存粒度偏粗]** → 每次保存写整个 `script.json`。对齐小说 Novel 现状，单本剧本体量可控；后续单剧本过大再考虑分片，本 change 不提前优化。
- **[删设定读盘扫描开销]** → 每次删设定 `readdir(scripts/<projectId>)` 并解析全部 Script。按 projectId 分区已把范围收敛到单项目，剧本数量有限，开销可接受；换来绝不误删被引用设定的正确性，优先正确性。
- **[UndoToast 与 flush 竞态]** → 撤销是瞬时内存操作，以“撤销快照随 workbench 生命周期失效”消除（D5）。
- **[共享设定与小说设定长期割裂]** → 用户在剧本与小说各维护一套人物/地点。本 change 有意接受，统一由后续“导入设定”change 处理。
- **[剧本按项目分区与小说平铺不一致]** → 有意差异，为删设定扫描边界收敛。两域各自独立，不要求磁盘布局一致。
- **[根 package.json 无 `"type":"module"` 的无害警告]** → 运行 `node --test` 时出现 `MODULE_TYPELESS_PACKAGE_JSON` 警告，不影响测试结果；不改根配置以免波及现有 build/dev 脚本。

## 测试策略

- **纯函数单测（新增回归网，`node --test`）**：
  - `scriptDomain.test.mjs`：建初始树（第1集第1场、稳定字段）、集/场增删改序（order 归一）、删除不变量（拒删最后一集/最后一场）、撤销快照重建（恢复原 id 与完整正文）。
  - `scriptReferences.test.mjs`：settingId 命中单场次 / 跨多场次 / 多剧本命中 / 未命中返回空 / 返回位置摘要结构。
- **集成 + GUI（沿用项目惯例）**：build（`npm run build`）+ 类型检查 + 文本完整性扫描 + Electron 真机验收核心链 + Web fallback 验收。单测是回归网，不替代真机验收。

## Migration Plan

- 全新数据域，无存量数据迁移。`schemaVersion: 1` 为基线；读文件时校验版本，未来 v2 再增迁移函数。
- 无回滚需求：本 change 只新增文件与一个路由分支，不改动小说域与现有 IPC。

## Open Questions

无。5 个实现层未定项已在 brainstorming 中钻定并落入上述 Decisions；技术前提（`node --test` 先例、`.mjs` import `.ts`）已实测验证。

## Spec Patch

无。5 个未定项均为实现层决策，不改动两份 delta spec 已定义的需求与验收场景；测试策略选 Node 内置 runner 正是为不破坏 proposal“无新增第三方依赖”，故无需回写 spec。
