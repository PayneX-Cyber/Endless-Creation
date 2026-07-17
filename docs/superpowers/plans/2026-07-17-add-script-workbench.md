---
change: add-script-workbench
design-doc: docs/superpowers/specs/2026-07-16-add-script-workbench-design.md
base-ref: f1a46651981a4634e51440292517d5b3728864e8
---

# 剧本工作台核心闭环实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Electron + React 工作台内交付项目级多剧本、集/场次纯文本编辑、共享人物/地点引用及 Electron/Web 双路径持久化核心闭环。

**Architecture:** 新增独立 `Script -> Episode -> ScriptScene` 域与项目级 `ProjectSettings`，不复用或修改小说域。Renderer 由 `ScriptWorkbench` 持有完整 draft，并通过单一保存链调用薄 service；Electron main 使用按项目分区的单剧本整树 JSON、原子写和按实体串行队列，Web 预览仅在无 preload bridge 时使用 project-scoped localStorage。

**Tech Stack:** TypeScript 6、React 19、Electron 42、Vite 8、Node 24 内置 `node:test`；无新增第三方依赖。

## Global Constraints

- `Novel`/`Chapter`/`Scene`、`Novel.settings` 和小说持久化完全不改。
- Script 磁盘布局固定为 `userData/scripts/<safeProjectId>/<scriptId>/script.json`；共享设定固定为 `userData/project-settings/<safeProjectId>.json`。
- `Script.schemaVersion` 与 `ProjectSettings.schemaVersion` 初值均为 `1`；只校验支持的版本，不创建恒等迁移模块。
- Script 单文件保存完整 `episodes -> scenes -> content` 树；结构操作和正文输入均先进入同一 draft，再由同一 600ms 防抖/`Ctrl+S` 立即保存链落盘。
- Electron 写入失败返回失败并保留 dirty draft；不得静默降级到 localStorage。
- Web fallback 只在无 Electron bridge 时启用，key 为 `endless-creation.scripts.<projectId>` 与 `endless-creation.project-settings.<projectId>`。
- 删除设定时 main 必须重新读取磁盘中当前项目的全部 Script，并扫描 `referenceIds`；不得信任 renderer 快照。
- 删除 Script 前必须加载完整树作为撤销快照；项目切换、路由离开或 workbench 卸载时撤销状态立即失效。
- Script/Episode/ScriptScene 均硬删除；不增加 `deletedAt`、回收站、恢复 IPC、搜索、标签或拖拽排序。
- 新 Script 自动含第 1 集第 1 场；每个 Script 至少 1 集，每集至少 1 场。
- 不新增 vitest；纯函数测试使用 Node 24 内置 `node --test`。
- 中文 UI 改动后必须运行文本完整性扫描；最终必须运行 `npm.cmd run build`。

---

## 文件结构总览

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/types/script.ts` | Renderer 权威剧本/设定类型与结果类型 | 新建 |
| `src/features/script-workbench/scriptDomain.ts` | 建树、集/场 CRUD、排序、不变量、完整快照纯函数 | 新建 |
| `src/features/script-workbench/scriptDomain.test.mjs` | Node 原生纯函数回归测试 | 新建 |
| `electron/main/scriptReferences.ts` | main 权威引用扫描纯函数 | 新建 |
| `electron/main/scriptReferences.test.mjs` | 引用扫描测试 | 新建 |
| `electron/main/index.ts` | Script/Settings 文件 IO、串行队列、IPC、关闭 flush | 修改 |
| `electron/preload/bridgeTypes.ts` | preload 协议类型副本 | 修改 |
| `electron/preload/index.ts` | 暴露 `script` / `projectSettings` bridge | 修改 |
| `src/types/electronBridge.ts` | Renderer 全局 bridge 类型声明 | 修改 |
| `src/services/rendererBridge.ts` | Electron/Web 双路径适配 | 修改 |
| `src/services/scriptService.ts` | Script 薄 service | 新建 |
| `src/services/projectSettingsService.ts` | SharedSettings 薄 service | 新建 |
| `src/features/script-workbench/ScriptWorkbench.tsx` | draft/save/selection/flush/undo 编排 | 新建 |
| `src/features/script-workbench/ScriptPanels.tsx` | 剧本、集、场次、设定、引用面板与 dialog/toast | 新建 |
| `src/features/script-workbench/ScriptWorkbench.css` | 工作台布局与状态样式 | 新建 |
| `src/features/script-workbench/index.ts` | feature 导出 | 新建 |
| `src/app/App.tsx` | 接通既有 `script-workbench` 导航分支 | 修改 |
| `package.json` | 新增 `test:script` | 修改 |

---

### Task 1: 剧本域纯函数与 Node 原生测试（OpenSpec 1.1）

**Files:**
- Create: `src/types/script.ts`
- Create: `src/features/script-workbench/scriptDomain.ts`
- Create: `src/features/script-workbench/scriptDomain.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces:
  ```ts
  export interface ScriptScene {
    id: string;
    title: string;
    content: string;
    order: number;
    referenceIds: string[];
    createdAt: string;
    updatedAt: string;
  }
  export interface Episode {
    id: string;
    title: string;
    order: number;
    scenes: ScriptScene[];
    createdAt: string;
    updatedAt: string;
  }
  export interface Script {
    id: string;
    projectId: string;
    title: string;
    episodes: Episode[];
    schemaVersion: 1;
    createdAt: string;
    updatedAt: string;
  }
  export interface ProjectSettingEntry {
    id: string;
    projectId: string;
    type: 'character' | 'location';
    title: string;
    body: string;
    createdAt: string;
    updatedAt: string;
  }
  export interface ProjectSettings {
    projectId: string;
    entries: ProjectSettingEntry[];
    schemaVersion: 1;
  }
  ```
- Produces pure functions:
  ```ts
  createInitialScript(projectId: string, title?: string): Script
  addEpisode(script: Script): Script
  renameEpisode(script: Script, episodeId: string, title: string): Script
  moveEpisode(script: Script, episodeId: string, direction: -1 | 1): Script
  removeEpisode(script: Script, episodeId: string): Script
  addScene(script: Script, episodeId: string): { script: Script; sceneId: string }
  updateScene(script: Script, episodeId: string, sceneId: string, patch: Partial<Pick<ScriptScene, 'title' | 'content' | 'referenceIds'>>): Script
  moveScene(script: Script, episodeId: string, sceneId: string, direction: -1 | 1): Script
  removeScene(script: Script, episodeId: string, sceneId: string): Script
  cloneScriptSnapshot(script: Script): Script
  ```

- [x] **Step 1: 写失败测试**

在 `scriptDomain.test.mjs` 使用 `node:test` + `node:assert/strict` 覆盖：

```js
test('新剧本自动包含第一集第一场', () => {
  const script = createInitialScript('default', '试写');
  assert.equal(script.projectId, 'default');
  assert.equal(script.episodes.length, 1);
  assert.equal(script.episodes[0].scenes.length, 1);
  assert.equal(script.episodes[0].scenes[0].content, '');
});

test('不能删除最后一集或最后一场', () => {
  const script = createInitialScript('default');
  assert.throws(() => removeEpisode(script, script.episodes[0].id), /至少保留一集/);
  assert.throws(
    () => removeScene(script, script.episodes[0].id, script.episodes[0].scenes[0].id),
    /至少保留一个场次/,
  );
});

test('排序归一且不修改原对象', () => {
  const source = addEpisode(createInitialScript('default'));
  const moved = moveEpisode(source, source.episodes[1].id, -1);
  assert.deepEqual(moved.episodes.map((item) => item.order), [0, 1]);
  assert.notEqual(moved, source);
});

test('撤销快照保留完整正文且与 draft 隔离', () => {
  const source = createInitialScript('default');
  source.episodes[0].scenes[0].content = '完整正文';
  const snapshot = cloneScriptSnapshot(source);
  source.episodes[0].scenes[0].content = '后来修改';
  assert.equal(snapshot.episodes[0].scenes[0].content, '完整正文');
  assert.equal(snapshot.id, source.id);
});
```

- [x] **Step 2: 运行测试并确认 RED**

Run: `node --test src/features/script-workbench/scriptDomain.test.mjs`

Expected: FAIL，原因是 `scriptDomain.ts` 或导出函数尚不存在。

- [x] **Step 3: 实现最小纯函数层**

使用 `crypto.randomUUID()` 生成稳定 ID，所有数组更新返回新对象；公共排序 helper 统一重写 `order`。删除最后一集/场抛出带中文可展示消息的 `Error`。快照使用平台原生 `structuredClone(script)`，不自造序列化器。

- [x] **Step 4: 增加测试脚本并跑 GREEN**

在 `package.json` 增加：

```json
"test:script": "node --test src/features/script-workbench/*.test.mjs"
```

Run: `npm.cmd run test:script`

Expected: `scriptDomain` 测试全部 PASS。

- [x] **Step 5: 构建与提交**

Run: `npm.cmd run build`

Expected: PASS。

```bash
git add package.json src/types/script.ts src/features/script-workbench/scriptDomain.ts src/features/script-workbench/scriptDomain.test.mjs
git commit -m "feat: add script domain invariants"
```

---

### Task 2: Electron Script 与 SharedSettings 持久化（OpenSpec 1.2 / 1.3）

**Files:**
- Create: `electron/main/scriptReferences.ts`
- Create: `electron/main/scriptReferences.test.mjs`
- Modify: `electron/main/index.ts`

**Interfaces:**
- Consumes: Task 1 的 Script/Settings 字段契约，在 main 内保持协议对称。
- Produces main handlers:
  ```ts
  listScripts(projectId: unknown)
  createScript(input: unknown)
  loadScript(projectId: unknown, scriptId: unknown)
  saveScript(value: unknown)
  deleteScript(projectId: unknown, scriptId: unknown)
  loadProjectSettings(projectId: unknown)
  saveProjectSettings(value: unknown)
  deleteProjectSetting(projectId: unknown, settingId: unknown)
  ```
- Produces:
  ```ts
  findSettingReferences(scripts: Script[], settingId: string): Array<{
    scriptId: string;
    scriptTitle: string;
    episodeId: string;
    episodeTitle: string;
    sceneId: string;
    sceneTitle: string;
  }>
  ```

- [x] **Step 1: 写引用扫描失败测试**

```js
test('扫描跨剧本引用并返回位置', () => {
  const references = findSettingReferences([scriptA, scriptB], 'setting-1');
  assert.deepEqual(references.map((item) => item.scriptId), ['script-a', 'script-b']);
  assert.equal(references[0].sceneId, 'scene-a');
});

test('未引用返回空数组', () => {
  assert.deepEqual(findSettingReferences([scriptA], 'missing'), []);
});
```

Run: `node --test electron/main/scriptReferences.test.mjs`

Expected: FAIL，函数尚不存在。

- [x] **Step 2: 实现引用扫描并跑 GREEN**

实现纯遍历，不读文件、不缓存计数；main 删除 handler 负责先读盘形成 `Script[]`，再调用该函数。

Run: `node --test electron/main/scriptReferences.test.mjs`

Expected: PASS。

- [x] **Step 3: 在 main 增加安全路径与读写**

复用现有 `safeProjectId`；新增严格 `safeScriptId`。路径固定：

```ts
function getScriptsProjectDir(projectId: unknown): string {
  return path.join(app.getPath('userData'), 'scripts', safeProjectId(projectId));
}

function getScriptPath(projectId: unknown, scriptId: string): string {
  return path.join(getScriptsProjectDir(projectId), scriptId, 'script.json');
}

function getProjectSettingsPath(projectId: unknown): string {
  return path.join(app.getPath('userData'), 'project-settings', `${safeProjectId(projectId)}.json`);
}
```

读文件必须校验 `schemaVersion === 1`、项目归属、集/场非空不变量和字符串字段；未知 schema 返回明确失败，不写 self-heal 占位迁移。

- [x] **Step 4: 实现原子写、队列与 CRUD handler**

新增独立：

```ts
const scriptSaveQueues = new Map<string, Promise<unknown>>();
const projectSettingsSaveQueues = new Map<string, Promise<unknown>>();
```

Script queue key 使用 `${projectId}:${scriptId}`，Settings queue key 使用安全 projectId。写入为 `.tmp` 后 `fs.rename`；删除 Script 前等待对应 save queue。

`deleteProjectSetting` 必须：

1. `readdir(getScriptsProjectDir(projectId), { withFileTypes: true })`
2. 从每个 `<scriptId>/script.json` 重新读取磁盘权威数据
3. 调用 `findSettingReferences`
4. 命中时返回 `{ ok: false, message, references }`
5. 未命中才删除 settings entry 并原子写回整库

- [x] **Step 5: 注册 IPC 与关闭 flush**

在现有 `registerIpcHandlers` 同级注册：

```ts
ipcMain.handle('script:list', (_event, projectId) => listScripts(projectId));
ipcMain.handle('script:create', (_event, input) => createScript(input));
ipcMain.handle('script:load', (_event, projectId, scriptId) => loadScript(projectId, scriptId));
ipcMain.handle('script:save', (_event, script) => saveScript(script));
ipcMain.handle('script:delete', (_event, projectId, scriptId) => deleteScript(projectId, scriptId));
ipcMain.handle('project-settings:load', (_event, projectId) => loadProjectSettings(projectId));
ipcMain.handle('project-settings:save', (_event, settings) => saveProjectSettings(settings));
ipcMain.handle('project-settings:delete', (_event, projectId, settingId) => deleteProjectSetting(projectId, settingId));
```

关闭前等待当前 Script/Settings queues settle，再通知 renderer flush 完成；不得修改小说 flush 语义。

- [x] **Step 6: 测试、构建与提交**

把 `package.json` 的脚本扩展为：

```json
"test:script": "node --test src/features/script-workbench/*.test.mjs electron/main/*.test.mjs"
```

Run: `npm.cmd run test:script`

Expected: 全部 PASS。

Run: `npm.cmd run build`

Expected: PASS。

```bash
git add electron/main/index.ts electron/main/scriptReferences.ts electron/main/scriptReferences.test.mjs
git commit -m "feat: persist project scripts and shared settings"
```

---

### Task 3: Preload、Renderer Bridge 与薄 Service（OpenSpec 1.4 / 1.5）

**Files:**
- Modify: `electron/preload/bridgeTypes.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/types/electronBridge.ts`
- Modify: `src/services/rendererBridge.ts`
- Create: `src/services/scriptService.ts`
- Create: `src/services/projectSettingsService.ts`

**Interfaces:**
- Produces bridge namespaces:
  ```ts
  script: {
    listScripts(projectId: string): Promise<ScriptListResult>;
    createScript(input: { projectId: string; title?: string }): Promise<ScriptResult>;
    loadScript(projectId: string, scriptId: string): Promise<ScriptResult>;
    saveScript(script: Script): Promise<ScriptResult>;
    deleteScript(projectId: string, scriptId: string): Promise<OperationResult>;
    onFlushBeforeClose?(callback: () => Promise<void> | void): () => void;
    finishFlushBeforeClose?(): Promise<void>;
  };
  projectSettings: {
    load(projectId: string): Promise<ProjectSettingsResult>;
    save(settings: ProjectSettings): Promise<ProjectSettingsResult>;
    delete(projectId: string, settingId: string): Promise<DeleteSettingResult>;
  };
  ```

- [x] **Step 1: 同步 preload 类型与 contextBridge**

在 `bridgeTypes.ts` 复制 Task 1 的协议字段；在 preload `contextBridge.exposeInMainWorld` 中只做 `ipcRenderer.invoke`/事件订阅，不放业务逻辑。

- [x] **Step 2: 实现 Web fallback**

在 `rendererBridge.ts` 增加 project-scoped helper：

```ts
const scriptStorageKey = (projectId: string) => `endless-creation.scripts.${projectId || 'default'}`;
const projectSettingsStorageKey = (projectId: string) => `endless-creation.project-settings.${projectId || 'default'}`;
```

Web `createScript` 复用 `createInitialScript`；list/load/save/delete 读写当前项目数组。SharedSettings 缺失时返回 `{ projectId, entries: [], schemaVersion: 1 }`。未知 schema 或 localStorage 写入异常返回 `{ ok: false }`，不得假装成功。

- [x] **Step 3: 实现薄 service**

```ts
export const scriptService = {
  listScripts: (projectId: string) => rendererBridge.listScripts(projectId),
  createScript: (input: { projectId: string; title?: string }) => rendererBridge.createScript(input),
  loadScript: (projectId: string, scriptId: string) => rendererBridge.loadScript(projectId, scriptId),
  saveScript: (script: Script) => rendererBridge.saveScript(script),
  deleteScript: (projectId: string, scriptId: string) => rendererBridge.deleteScript(projectId, scriptId),
};
```

`projectSettingsService` 同样只转发；不得在 service 中再维护第二套 draft。

- [x] **Step 4: 验证双路径类型一致**

Run: `npm.cmd run build`

Expected: Renderer 与 Electron 类型检查 PASS；无 `any` 逃逸到公开 bridge。

```bash
git add electron/preload/bridgeTypes.ts electron/preload/index.ts src/types/electronBridge.ts src/services/rendererBridge.ts src/services/scriptService.ts src/services/projectSettingsService.ts
git commit -m "feat: bridge script persistence to renderer"
```

---

### Task 4: ScriptWorkbench 单一 draft、保存链与核心编辑 UI（OpenSpec 2.1-2.5）

**Files:**
- Create: `src/features/script-workbench/ScriptWorkbench.tsx`
- Create: `src/features/script-workbench/ScriptPanels.tsx`
- Create: `src/features/script-workbench/index.ts`

**Interfaces:**
- Consumes: Tasks 1/3 的纯函数和 service。
- Produces: `<ScriptWorkbench projectId: string>`。

- [x] **Step 1: 实现工作台状态编排**

`ScriptWorkbench` 持有：

```ts
const [summaries, setSummaries] = useState<ScriptSummary[]>([]);
const [draft, setDraft] = useState<Script | null>(null);
const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
const [saveStatus, setSaveStatus] = useState<'saved' | 'dirty' | 'saving' | 'failed'>('saved');
const [undoSnapshot, setUndoSnapshot] = useState<Script | null>(null);
```

同时维护 `latestDraftRef`、`latestSaveStatusRef`、`revisionRef`，复用小说模式解决保存完成时仍有新 revision 的竞态。

- [x] **Step 2: 实现唯一 mutation/save 链**

所有结构/正文更新只调用：

```ts
function updateDraft(update: (script: Script) => Script) {
  setDraft((current) => {
    if (!current) return current;
    revisionRef.current += 1;
    setSaveStatus('dirty');
    return update(current);
  });
}
```

`saveDraft` 读取传入或 latest ref 的完整树。`dirty` 后 600ms 防抖保存；`Ctrl+S` 阻止浏览器默认行为并立即保存；失败保持 `failed` 与 draft，可点击重试。

- [x] **Step 3: 实现剧本/集/场 CRUD 与选择**

`ScriptLibraryPanel` 提供新建、重命名、切换、删除确认。Episode/Scene 使用上移/下移按钮，不加拖拽依赖。纯函数抛出的最后一集/场错误展示为 feedback。

删除 Script 流程：

```ts
const loaded = await scriptService.loadScript(projectId, summary.id);
if (!loaded.ok || !loaded.script) return showError(...);
const snapshot = cloneScriptSnapshot(loaded.script);
const deleted = await scriptService.deleteScript(projectId, summary.id);
if (deleted.ok) setUndoSnapshot(snapshot);
```

撤销调用 `saveScript(snapshot)` 恢复原 ID 与完整树。

- [x] **Step 4: 实现纯文本编辑器与保存状态**

`ScriptEditor`：

- 场次标题 input 绑定 `ScriptScene.title`
- textarea 绑定 `ScriptScene.content`
- 不 trim 正文
- `ReferencePanel` 插槽暂由 Task 5 填充
- 明确展示“未保存 / 保存中 / 已保存 / 保存失败”

- [x] **Step 5: 绑定项目/生命周期 flush**

项目变化、组件卸载、`beforeunload`、document hidden 与 Electron close event 均调用同一个 `flushLatestDraft`。在 flush/项目切换/卸载开始时先 `setUndoSnapshot(null)`，再保存 dirty draft，最后重置选择并加载新项目。

- [x] **Step 6: 构建与提交**

Run: `npm.cmd run test:script`

Expected: PASS。

Run: `npm.cmd run build`

Expected: PASS。

```bash
git add src/features/script-workbench/ScriptWorkbench.tsx src/features/script-workbench/ScriptPanels.tsx src/features/script-workbench/index.ts
git commit -m "feat: add script authoring workbench"
```

---

### Task 5: SharedSettings、ReferencePanel 与引用完整性 UI（OpenSpec 3.1-3.3）

**Files:**
- Modify: `src/features/script-workbench/ScriptWorkbench.tsx`
- Modify: `src/features/script-workbench/ScriptPanels.tsx`

**Interfaces:**
- Consumes: `projectSettingsService` 与 main 返回的 `references`。
- Produces: 项目级人物/地点 CRUD、当前场次 `referenceIds` 编辑。

- [x] **Step 1: 加载并编辑项目设定整库**

缺失库显示空态。新增/编辑 entry 后更新 `ProjectSettings.entries` 并调用 service 保存整库。只允许 `character | location`。

- [x] **Step 2: 实现场次引用**

ReferencePanel 按人物/地点筛选，以 checkbox/card 添加或移除当前场次 `referenceIds`；名称只来自当前 settings lookup，不写入正文或 Script 快照。

- [x] **Step 3: 实现删除完整性反馈**

调用 `projectSettingsService.delete(projectId, settingId)`。若 main 返回引用位置，保留设定并展示“剧本 / 集 / 场次”摘要；UI 不重扫其他 Script。

- [x] **Step 4: 可访问性收口**

- 删除确认使用 `role="dialog"`、`aria-modal="true"`，Escape 关闭
- 图标按钮有 tooltip/`aria-label`
- 上移/下移在边界 disabled
- 列表和引用 checkbox 可键盘操作
- 异步错误在局部 `role="status"`/`role="alert"` 呈现，不清空编辑器

- [x] **Step 5: 构建与提交**

Run: `npm.cmd run build`

Expected: PASS。

```bash
git add src/features/script-workbench/ScriptWorkbench.tsx src/features/script-workbench/ScriptPanels.tsx
git commit -m "feat: add shared settings and scene references"
```

---

### Task 6: 路由与生产级工作台样式整合（OpenSpec 2.1 / 3.3）

**Files:**
- Create: `src/features/script-workbench/ScriptWorkbench.css`
- Modify: `src/features/script-workbench/ScriptWorkbench.tsx`
- Modify: `src/features/script-workbench/ScriptPanels.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: Task 4 的 `ScriptWorkbench`。
- Produces: 既有侧边栏入口对应的可用工作台首屏。

- [x] **Step 1: 接通 App 路由**

导入 feature，并在现有条件分支中增加：

```tsx
activeNavId === 'script-workbench' ? (
  <ScriptWorkbench projectId={activeProjectId ?? 'default'} />
) : ...
```

视频工作台、提示词库与其他 blank workspace 行为保持不动。

- [x] **Step 2: 实现稳定桌面布局**

使用一层 workbench 容器与明确 grid：

```css
.script-workbench {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(180px, 240px) minmax(0, 1fr) minmax(220px, 280px);
}
```

小窗口降为两列/抽屉式辅助栏，正文编辑区始终 `min-width: 0; min-height: 0`，不出现文字/按钮重叠。卡片圆角不超过 8px，不使用营销式 hero、渐变 orb 或卡套卡。

- [x] **Step 3: UI 文案与视觉验证**

检查空态、加载态、失败态、删除 dialog、UndoToast、保存状态在深浅主题和窄窗口中均可读。

Run: `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"`

Expected: `TEXT INTEGRITY OK`。

- [x] **Step 4: 构建与提交**

Run: `npm.cmd run build`

Expected: PASS。

```bash
git add src/app/App.tsx src/features/script-workbench
git commit -m "feat: connect and style script workbench"
```

---

### Task 7: 全链验证与 OpenSpec 收口（OpenSpec 4.1-4.4）

**Files:**
- Modify: `openspec/changes/add-script-workbench/tasks.md`
- Modify: `docs/superpowers/plans/2026-07-17-add-script-workbench.md`

- [x] **Step 1: 自动检查**

Run: `npm.cmd run test:script`

Expected: scriptDomain 与 scriptReferences 全部 PASS。

Run: `npm.cmd run build`

Expected: renderer TypeScript + Vite + Electron TypeScript 全部 PASS。

Run: `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"`

Expected: `TEXT INTEGRITY OK`。

Run: `git diff --check`

Expected: 无输出。

- [x] **Step 2: Web fallback 验收**

浏览器预览逐项验证：

- 当前项目新建多个 Script，刷新后列表/正文恢复
- 新 Script 自动含第 1 集第 1 场
- 集/场增删改序，最后一集/场删除被拦
- 600ms 自动保存、`Ctrl+S`、保存失败状态
- 新建人物/地点、场次引用/移除、名称不写入正文
- 删除被引用设定被拒并展示位置
- 删除 Script 后即时撤销完整恢复，切换项目后撤销失效

- [x] **Step 3: Electron 真机验收**

使用隔离 `userData`，不得污染用户真实配置。验证磁盘：

```text
scripts/<projectId>/<scriptId>/script.json
project-settings/<projectId>.json
```

关闭重开后正文、结构、引用均恢复；模拟/制造写盘失败时返回失败、dirty 可重试且 localStorage 未出现 Electron 降级副本。

- [x] **Step 4: 同步任务状态**

依据实际证据逐项勾选 OpenSpec 1.1-4.4；不得一次性无证据全勾。确认 17 项全部完成。

- [x] **Step 5: 最终提交**

仅暂存当前 change 的源码、计划与 OpenSpec artifacts；排除 `.agent/`、`.agents/`、`.claude/`、`.codegraph/`、`.codex/`、`skills-lock.json`。

```bash
git add package.json electron src/app/App.tsx src/features/script-workbench src/services/rendererBridge.ts src/services/scriptService.ts src/services/projectSettingsService.ts src/types/script.ts src/types/electronBridge.ts docs/superpowers/plans/2026-07-17-add-script-workbench.md openspec/changes/add-script-workbench
git status --short
git commit -m "feat: add script workbench core loop"
```

---

## Self-Review

- **Spec coverage:** Task 1 → 1.1；Task 2 → 1.2/1.3；Task 3 → 1.4/1.5；Task 4 → 2.1-2.5；Task 5 → 3.1-3.3；Task 6 → 路由与生产级 UI 收口；Task 7 → 4.1-4.4。
- **边界一致:** 无小说域改动、无设定迁移、无软删除、无 AI/导出/分镜/拖拽/搜索、无新增第三方依赖。
- **并发一致:** Renderer 单一 draft/save 链；main Script/Settings 独立串行队列；项目切换先失效撤销再 flush。
- **权威源一致:** 设定删除只信 main 读盘扫描结果；UI 不维护引用计数或跨剧本扫描副本。
- **Placeholder scan:** 无 TBD/TODO/“后续实现”；未来 schema 迁移只作为非目标说明，不创建占位文件。
- **Type consistency:** `Script`、`Episode`、`ScriptScene`、`ProjectSettings`、bridge/service 方法名在任务间保持一致。
