# Brainstorm Summary

- Change: add-script-workbench
- Date: 2026-07-16

## 确认的技术方案

深度设计在 open 阶段 7 个高层决策基础上，钻定 5 个实现层未定项：

### 1. Electron 磁盘布局：按 projectId 分区（已确认）

```
userData/
  scripts/
    <projectId>/
      <scriptId>/
        script.json        # 整棵 episodes→scenes→content 树，单文件
  project-settings/
    <projectId>.json       # 共享设定库单文件
```

- 单文件 per Script（`script.json` 存整树），对齐小说 `novel.json`；不 per-entity 拆集/场文件（会破坏整树原子写 + 单一保存链，属过度设计）。
- 复用小说存储三件套：目录 per-entity + 原子写（`.tmp`→rename）+ 按 id 串行保存队列（对齐 `novelSaveQueues`）。
- **关键差异**：小说域磁盘上不按 projectId 分区（平铺 `novels/<novelId>/`，projectId 只是字段，listNovels 读全部再过滤）；剧本域**改为按 projectId 目录分区**，使"当前项目"边界=目录边界，删设定扫描 `readdir(scripts/<projectId>)` 即可，不碰其他项目。
- SharedSettings 单文件 `project-settings/<projectId>.json`（整库读写单元，无 per-entity 独立保存需求）。
- Web fallback：`endless-creation.scripts.<projectId>` / `endless-creation.project-settings.<projectId>`，天然按项目分区。

### 2. schemaVersion（已确认）

- 剧本域与设定域初值均 = 1。
- `readScriptFile`/`readSettingsFile` 保留 `if (parsed.schemaVersion !== 1) ...` 版本校验骨架（对齐小说 `readNovelFile` 的 `version !== 8` self-heal 写法）。
- **不创建恒等 `scriptMigration.ts`**；v1 只校验版本，出现 v2 时再增加迁移函数。

### 3. 测试策略：Node 内置 test runner（已确认，方案 2）

- 用 `node --test` 补纯函数单测，**不引入 vitest**，**不改 proposal 的"无新增第三方依赖"**。
- 仓库已有先例：`test:ai-workflow` = `node --test --test-concurrency=8 tools/ai-workflow/test/*.test.mjs`。
- **已实测验证**：`.mjs` 测试文件可直接 `import` `.ts` 纯函数源模块，Node v24.16 type-stripping 生效，`node --test` 跑通（仅有 `MODULE_TYPELESS_PACKAGE_JSON` 无害警告，不影响运行）。
- 新增 npm script（形如 `test:script`）跑剧本域纯函数测试。

### 4. 纯函数模块边界（测试策略反推的架构，已确认）

- `src/features/script-workbench/scriptDomain.ts`：纯函数——建初始剧本树（第1集第1场）/ 集与场增删改序 / 删除不变量校验（不删到空）/ 完整撤销快照重建。不依赖 Electron/DOM。
- `electron/main/scriptReferences.ts`：纯函数——从磁盘读取 Script[] 后扫描某 settingId 的引用位置。放 main 侧。
- **UI 不自行扫描引用**，只展示 main handler 返回的引用位置摘要；否则违背"磁盘为权威源"（Decision 5）。这是对 open 阶段 Decision 5 的 UI 层强化。
- main handler 和组件调用纯函数，自身只管 IO 与渲染（薄 handler / 薄组件）。

### 5. 引用扫描共享（已确认）

- 引用扫描逻辑集中在 `scriptReferences.ts` 一份，main 删设定读盘后调用；UI 不复制该逻辑。

## 关键取舍与风险

- **整树保存粒度偏粗** → 每次存整个 script.json；对齐小说现状，单本剧本体量可控，不提前分片优化。
- **删设定读盘扫描开销** → 每次删设定 readdir 当前项目全部 Script 并解析；项目内剧本有限，优先正确性（绝不误删被引用设定）。
- **剧本域按 projectId 分区 vs 小说域平铺的不一致** → 有意为之：剧本删设定的"当前项目"边界需要目录级隔离，分区让扫描范围天然收敛；小说域不动。
- **MODULE_TYPELESS_PACKAGE_JSON 警告** → 根 package.json 无 `"type":"module"`，`.ts`/`.mjs` 直跑有无害警告；不改根配置（避免影响现有 CJS/ESM 混用），接受警告。
- **UndoToast 与 flush 竞态** → 撤销快照随 workbench 生命周期失效（沿用 open 阶段 Decision 4）。

## 测试策略

- Node 内置 `node --test`，`.mjs` 测试 import `.ts` 纯函数源。
- 覆盖 `scriptDomain.ts`（建树/增删改序/删除不变量/撤销快照重建）与 `scriptReferences.ts`（引用扫描命中/未命中/多场次）。
- 集成/GUI 层仍走 build + 类型检查 + Electron 真机验收（对齐小说域惯例）。
- 纯函数单测是新增的自动回归网，不替代真机验收。

## Spec Patch

- **无需回写 delta spec 的需求内容**：5 个未定项都是实现层决策（磁盘布局/文件粒度/版本初值/测试框架选型/模块边界），不改变 delta spec 已定义的验收场景与需求。
- proposal 的"无新增第三方依赖"**保持不变**（方案 2 选 Node 内置 runner 正是为了不破坏这条），因此**不产生 Spec Patch**。
- 若实现中发现验收场景缺口，另行提 Spec Patch 回写 openspec delta spec，不在 Design Doc 建第二份需求 spec。
