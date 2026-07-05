# 小说创作 5c：导出 .md 文件切片规格

日期：2026-07-06
上位文档：`docs/plans/2026-06-30-novel-creation-migration-plan.md`（第五阶段「文稿构建与导出」）、`docs/plans/2026-07-05-novel-stats-overview-5b-spec.md`（切片风格参考）

## 总体结论

5c 是阶段五第三刀，导出族第二刀。5a 证明了「全书 Markdown 拼装 → 剪贴板」最小闭环，5c 复用同一份正文，把出口从剪贴板换成**磁盘文件**：**在工作台顶栏「复制全书 Markdown」旁边加一个「导出 .md 文件」按钮**。

一句话目标：

```text
工作台顶栏点「导出 .md 文件」→ Electron 弹保存框选路径落盘 / Web 环境走 Blob 下载 → 得到一份全书 Markdown 文件
```

5c 唯一的新基础设施是**一个保存文本文件的 IPC 通道**（renderer → electron dialog → writeFile），目标是把这条文件保存调用链跑通。正文内容 100% 复用 5a 的 `buildWholeBookMarkdown`，不重新设计拼装、不改 5a 输出格式。

范围锁定为：**一个保存文本文件 IPC + 工作台顶栏一个导出按钮 + 一个 handler（Electron 优先，Web Blob 兜底）**。其它都不碰。

## 一、数据口径

**零 schema 新增，零落库，只读导出。**

- 正文 100% 复用 `ChapterWorkbench.tsx` 内现有 `buildWholeBookMarkdown(novel)`（返回 `string | null`）。**不提取该 builder、不改其输出格式。**
- 导出是纯读操作：不写 `novel.json`、不触发保存、不改任何 novel 字段、不碰 versions/selectedVersionId。
- 不新增：格式选择（.txt/.docx）、导出历史、路径记忆、导出配置。以上全部后置。

## 二、IPC 接口

新增一个保存文本文件通道，照现有 `app:select-generated-images-directory`（dialog 先例）+ `clipboard:write-text` 风格，触及 6 个文件的类型链。

### 通道签名

```ts
saveTextFile(defaultName: string, content: string): Promise<{ ok: boolean; message: string; path?: string }>
```

- IPC channel 名：`app:save-text-file`。
- `defaultName`：默认文件名（含 `.md` 扩展名），由 renderer 侧算好传入。
- `content`：全书 Markdown 文本。
- 返回：成功 `{ ok: true, message: '已导出到 <path>。', path }`；取消 `{ ok: false, message: '已取消导出。' }`；失败抛错由 renderer catch（见四节）。

### 触及文件（类型链，与 clipboard.writeText 同款五处 + renderer 封装）

1. **`electron/preload/index.ts`** — bridge 的 `app` 分组新增 `saveTextFile: (defaultName, content) => ipcRenderer.invoke('app:save-text-file', defaultName, content)`。
2. **`electron/preload/bridgeTypes.ts`** — `EndlessCreationBridge.app` 接口新增 `saveTextFile(defaultName: string, content: string): Promise<{ ok: boolean; message: string; path?: string }>`。
3. **`src/types/electronBridge.ts`** — renderer 侧镜像接口同步新增同款签名（两份接口必须一致）。
4. **`electron/main/index.ts`** — 新增 `ipcMain.handle('app:save-text-file', ...)`（见三节），并把 `import type { OpenDialogOptions }` 扩为 `import type { OpenDialogOptions, SaveDialogOptions }`。
5. **`src/services/rendererBridge.ts`** — 新增 `exportMarkdownFile`（Electron 优先 + Web Blob 兜底，见四节）。
6. **`src/features/novel-creation/ChapterWorkbench.tsx`** — 顶栏按钮 + `exportWholeBookMarkdown()` handler（见五节）。

## 三、Electron main handler

放在 `app:select-generated-images-directory` handler 之后，照同款 `mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options)` 分支与 `{ ok, message, path? }` 返回结构。

```ts
ipcMain.handle('app:save-text-file', async (_event, defaultName: unknown, content: unknown): Promise<{ ok: boolean; message: string; path?: string }> => {
  if (typeof content !== 'string') {
    throw new Error('saveTextFile expects string content.');
  }
  const safeName = sanitizeFileName(typeof defaultName === 'string' ? defaultName : '') || '未命名小说.md';
  const options: SaveDialogOptions = {
    title: '导出全书 Markdown',
    defaultPath: safeName,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { ok: false, message: '已取消导出。' };
  await fs.writeFile(result.filePath, content, 'utf-8');
  return { ok: true, message: `已导出到 ${result.filePath}。`, path: result.filePath };
});
```

**防御性 sanitize（main 侧，IPC 是边界）** — 在 main 文件内加一个模块级 helper（与其它 helper 同区）：

```ts
function sanitizeFileName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}
```

- 替换非法字符 `/ \ : * ? " < > |`（含路径分隔符）为 `_`，避免恶意/异常 defaultName 造成越权路径或非法文件名。
- main 侧 sanitize 只作用于 `defaultPath`（用户仍可在保存框里改名/改路径，以最终 `result.filePath` 为准，不再二次 sanitize 用户显式选择的路径）。

## 四、Renderer 封装（rendererBridge.exportMarkdownFile）

照 `copyText` 同款「Electron 优先 + Web fallback」双路，放在 `copyText` 附近。

```ts
async exportMarkdownFile(defaultName: string, content: string): Promise<{ ok: boolean; message: string }> {
  const electronBridge = getElectronBridge();

  if (electronBridge) {
    return electronBridge.app.saveTextFile(defaultName, content);
  }

  // Web fallback：Blob + <a download>，保持 npm run dev 可用
  const document = globalThis.document;
  if (!document?.body) {
    throw new Error('File export bridge is unavailable.');
  }
  const safeName = defaultName.replace(/[\/\\:*?"<>|]/g, '_').trim() || '未命名小说.md';
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { ok: true, message: '已触发下载。' };
}
```

- Web 侧 sanitize 与 main 侧同款字符集（`/ \ : * ? " < > |`）。
- Web 侧 `<a download>` 不返回 `path`（浏览器不暴露落盘路径），返回 `{ ok, message }` 即可——签名对齐取 `{ ok, message }` 交集，`path` 为 Electron 独有的可选返回，renderer 封装不透传 `path`（handler 只需 ok/message 反馈）。

## 五、按钮与 handler（ChapterWorkbench.tsx）

### handler

放在现有 `copyWholeBookMarkdown()` 附近，同款结构（空书 alert 早退 + try/catch）：

```ts
async function exportWholeBookMarkdown() {
  const markdown = buildWholeBookMarkdown(novel);
  if (!markdown) {
    window.alert('暂无可导出的正文');
    return;
  }
  const defaultName = `${novel.title.trim() || '未命名小说'}.md`;
  try {
    const result = await rendererBridge.exportMarkdownFile(defaultName, markdown);
    if (result.ok) {
      window.alert(result.message);
    } else {
      window.alert(result.message); // '已取消导出。'
    }
  } catch {
    window.alert('导出失败，请重试');
  }
}
```

### 按钮

在顶栏「复制全书 Markdown」按钮（`ChapterWorkbench.tsx:670` 附近）之后紧挨着加一个同款 `novel-flow__ghost`：

```tsx
<button className="novel-flow__ghost" onClick={() => void exportWholeBookMarkdown()} type="button">导出 .md 文件</button>
```

- **不加 `disabled={busy}`**：与「复制全书 Markdown」一致——只读导出，不碰 AI 请求链、不写 novel。（Phase 4 审查已就复制按钮认定只读操作无害，导出同理。）
- 零新增 CSS：复用现有 `.novel-flow__ghost`。

## 六、后置清单（不进 5c）

- .txt / .docx 导出（格式分支，各自独立切）
- 导出格式选择器 / 导出配置
- 导出历史 / 上次路径记忆
- 单章导出、按选区导出
- 提取 `buildWholeBookMarkdown` 到 `novelShared`（等 overview 或多格式也要复用时再抽）
- 导出 PDF / EPUB 等需额外依赖的格式

**不做假入口：以上一律不展示，不置灰占位。**

## 七、改动文件（预计 6 个）

1. **`electron/preload/index.ts`** — bridge.app 新增 `saveTextFile` invoke。
2. **`electron/preload/bridgeTypes.ts`** — `EndlessCreationBridge.app` 接口新增签名。
3. **`src/types/electronBridge.ts`** — renderer 镜像接口新增同款签名。
4. **`electron/main/index.ts`** — `SaveDialogOptions` import + `sanitizeFileName` helper + `app:save-text-file` handler。
5. **`src/services/rendererBridge.ts`** — `exportMarkdownFile`（Electron 优先 + Web Blob 兜底）。
6. **`src/features/novel-creation/ChapterWorkbench.tsx`** — 顶栏按钮 + `exportWholeBookMarkdown()` handler。

## 八、验收标准

1. 工作台顶栏「复制全书 Markdown」右侧显示「导出 .md 文件」按钮。
2. Electron 环境点击：弹保存框，默认名 `${标题}.md`（标题空为「未命名小说.md」），选路径确认后落盘一份全书 Markdown，内容与「复制全书 Markdown」逐字一致。
3. Electron 保存框取消：无文件写入，提示「已取消导出。」，不报错。
4. 空书（`buildWholeBookMarkdown` 返回 null）：提示「暂无可导出的正文」，不弹保存框、不写文件。
5. 文件名 sanitize：标题含 `/ \ : * ? " < > |` 时，默认名中这些字符被替换为 `_`（Web 与 Electron main 双侧各做一次防御）。
6. Web（`npm run dev`）环境点击：走 Blob 下载，得到同一份 Markdown，不报「bridge unavailable」。
7. **零落库**：导出前后 `novel.json` 内容/hash 完全一致（不写字段、不触发保存）。
8. busy（AI 任务进行中）不禁用导出按钮，导出不影响进行中的 AI 请求 / 保存 / versions。
9. 不破坏 3a/3b/4a-4e/5a/5b 全链路、小说 CRUD、生图与资产模块。
10. 零新增 schema / Provider / 依赖；只新增一个 IPC 通道 + 一个只读导出动作。
11. 未提取/未改动 `buildWholeBookMarkdown`（5a 输出格式不变）。

## 建议实施顺序

1. IPC 类型链：preload/index.ts → bridgeTypes.ts → electronBridge.ts（三处接口对齐）。
2. main：`SaveDialogOptions` import + `sanitizeFileName` helper + `app:save-text-file` handler。
3. renderer：`rendererBridge.exportMarkdownFile`（双路兜底）。
4. UI：ChapterWorkbench.tsx 顶栏按钮 + `exportWholeBookMarkdown()` handler。
5. QA：验收 11 条 + 零落库 hash 校验 + build（renderer tsc+vite / electron tsc）+ 双目录文本扫描 + 坏文案 grep + Web dev 导出实测 + Electron 导出/取消/空书三态。
