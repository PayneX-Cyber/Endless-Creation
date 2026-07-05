# 导出 .md 文件（saveTextFile）5c 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐 Task 实施。步骤用 checkbox（`- [ ]`）跟踪。上位规格：`docs/plans/2026-07-06-novel-export-markdown-file-5c-spec.md`。

**Goal:** 在工作台顶栏「复制全书 Markdown」旁新增「导出 .md 文件」按钮，复用现有 `buildWholeBookMarkdown`，通过一个新增的保存文件 IPC（Electron `showSaveDialog` + `fs.writeFile`）落盘；`npm run dev` 纯渲染器环境走 Blob 下载兜底。目标是证「renderer → electron dialog → writeFile」调用链，不是重排书级操作中心。

**Architecture:** 新增 `saveTextFile(defaultName, content)` 一条 IPC，贯穿 6 文件类型链。renderer 侧封装照 `copyText` 同款「Electron 优先 + Web fallback」双路。文件名 sanitize 双侧各做一次（IPC 是边界）。

## Global Constraints

- 零新增 schema / Provider / localStorage / 第三方依赖。仅新增 1 条 IPC。
- 不提取 `buildWholeBookMarkdown`（保持 ChapterWorkbench 内非导出函数），不改 5a Markdown 输出格式。
- 不做格式选择 / .txt / .docx / 导出历史 / 路径记忆 —— 全部后置。
- busy 不禁用（与「复制全书 Markdown」一致：只读导出，不碰 AI 请求、不写 novel）。
- 空书（`buildWholeBookMarkdown` 返回 null）→ `window.alert('暂无可导出的正文')`，不弹保存框。
- 取消保存 → `{ ok: false, message: '已取消导出。' }`，renderer 静默（不 alert 成功、不 alert 失败）。
- 文件名 sanitize：替换 `/ \ : * ? " < > |` 及路径分隔符为下划线；默认名 `${novel.title.trim() || '未命名小说'}.md`。Web Blob 侧与 Electron main 侧各做一次。
- 项目无测试框架，验证沿用 5b 模式：`npm.cmd run build` + 双目录文本扫描 + 坏文案 grep + 三态验收自查；不写单元测试。
- 文本扫描脚本：`C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py`。

---

## Task 1: IPC 类型链（三处镜像 + preload invoke）

**Files:**
- Modify: `electron/preload/bridgeTypes.ts`（`EndlessCreationBridge.app` 加方法签名）
- Modify: `src/types/electronBridge.ts`（renderer 侧镜像同款签名）
- Modify: `electron/preload/index.ts`（`app` 分组加 invoke）

**签名（三处一致）：**

```ts
saveTextFile(defaultName: string, content: string): Promise<{ ok: boolean; message: string; path?: string }>
```

- [ ] **Step 1:** `electron/preload/bridgeTypes.ts` 的 `EndlessCreationBridge.app` 接口内，`readProjectAssetImageDataUrl` 一行下方加上述签名。
- [ ] **Step 2:** `src/types/electronBridge.ts` 的 `EndlessCreationBridge.app` 内加同款签名（两份镜像必须逐字一致）。
- [ ] **Step 3:** `electron/preload/index.ts` 的 `app: { ... }` 分组内加 invoke：
  ```ts
  saveTextFile: (defaultName, content) => ipcRenderer.invoke('app:save-text-file', defaultName, content),
  ```
- [ ] **Step 4:** `npm.cmd run build` — 此时 main 尚无 handler，但 tsc 只查类型不查运行期注册，应 PASS。若某一份镜像漏改，renderer tsc 会报接口不匹配 —— 用它当护栏。

---

## Task 2: main handler + sanitize + writeFile

**Files:**
- Modify: `electron/main/index.ts`

**Interfaces:** Consumes preload invoke `app:save-text-file`。复用现有 `dialog`、`fs`（文件顶部已 import）。

- [ ] **Step 1:** 在文件已有 helper 区加防御性 sanitize（若已有同名 util 则复用，勿重复定义）：
  ```ts
  function sanitizeExportFileName(name: string): string {
    const cleaned = name.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    return cleaned || '未命名小说';
  }
  ```
- [ ] **Step 2:** 在 `app:select-generated-images-directory` handler 附近，照其风格加 handler（`SaveDialogOptions` 需从 `electron` type import；`showSaveDialog` 走 `mainWindow ? ... : ...` 同款分支）：
  ```ts
  ipcMain.handle('app:save-text-file', async (_event, defaultName: unknown, content: unknown): Promise<{ ok: boolean; message: string; path?: string }> => {
    if (typeof content !== 'string') throw new Error('saveTextFile expects string content.');
    const safeName = sanitizeExportFileName(typeof defaultName === 'string' ? defaultName : '未命名小说.md');
    const options: SaveDialogOptions = {
      title: '导出为 Markdown 文件',
      defaultPath: safeName,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false, message: '已取消导出。' };
    await fs.writeFile(result.filePath, content, 'utf-8');
    return { ok: true, message: '已导出。', path: result.filePath };
  });
  ```
- [ ] **Step 3:** 确认 `SaveDialogOptions` 加入顶部 `import type { OpenDialogOptions } from 'electron';` 那行 → `import type { OpenDialogOptions, SaveDialogOptions } from 'electron';`。
- [ ] **Step 4:** `npm.cmd run build` — PASS。

---

## Task 3: rendererBridge 双路封装（Electron / Web Blob）

**Files:**
- Modify: `src/services/rendererBridge.ts`

**Interfaces:** Produces `rendererBridge.saveTextFile(defaultName, content)`，供 ChapterWorkbench 调用。照 `copyText` 同款 `getElectronBridge()` 分支。

- [ ] **Step 1:** 在 `copyText` 附近加方法（返回统一 `{ ok, message }`，供 UI 决定 alert 文案）：
  ```ts
  async saveTextFile(defaultName: string, content: string): Promise<{ ok: boolean; message: string }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) {
      const result = await electronBridge.app.saveTextFile(defaultName, content);
      return { ok: result.ok, message: result.message };
    }
    // Web fallback: Blob 下载
    const document = globalThis.document;
    if (!document?.body) throw new Error('File export bridge is unavailable.');
    const safeName = defaultName.replace(/[/\\:*?"<>|]/g, '_').trim() || '未命名小说.md';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { ok: true, message: '已导出。' };
  },
  ```
- [ ] **Step 2:** `npm.cmd run build` — PASS。

---

## Task 4: ChapterWorkbench 按钮 + handler

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`

**Interfaces:** Consumes `rendererBridge.saveTextFile`；复用同文件内 `buildWholeBookMarkdown(novel)`。

- [ ] **Step 1:** 在 `copyWholeBookMarkdown` 函数下方加：
  ```ts
  async function exportWholeBookMarkdownFile() {
    const markdown = buildWholeBookMarkdown(novel);
    if (!markdown) {
      window.alert('暂无可导出的正文');
      return;
    }
    const defaultName = `${novel.title.trim() || '未命名小说'}.md`;
    try {
      const result = await rendererBridge.saveTextFile(defaultName, markdown);
      if (result.ok) window.alert('全书 Markdown 已导出');
      // 取消（ok:false）静默，不 alert
    } catch {
      window.alert('导出失败，请重试');
    }
  }
  ```
- [ ] **Step 2:** 在顶栏「复制全书 Markdown」按钮（`novel-flow__ghost`）之后加同款按钮：
  ```tsx
  <button className="novel-flow__ghost" onClick={() => void exportWholeBookMarkdownFile()} type="button">导出 .md 文件</button>
  ```
  不加 `disabled={busy}`（与复制按钮一致）。
- [ ] **Step 3:** `npm.cmd run build` — PASS。

---

## Task 5: 验证与验收

**Files:** 无（仅验证）。可整体一次提交，或每 Task 独立提交（tsconfig 未开 `noUnusedLocals`）。

- [ ] **Step 1: build** — `npm.cmd run build` PASS（tsc renderer + vite + tsc electron）。
- [ ] **Step 2: 双目录文本扫描**
  ```bash
  python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" src
  python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" electron
  ```
  Expected: 两次 `TEXT INTEGRITY OK`。
- [ ] **Step 3: 坏文案 grep（两组均无命中）**
  ```bash
  git grep -n "????\|Mock AI\|GPT Image 2\|3 通道" -- src electron ':!package-lock.json'
  git grep -n "很抱歉\|非常抱歉\|对不起\|抱歉\|十分抱歉" -- src electron ':!package-lock.json'
  ```
- [ ] **Step 4: 类型链完整性专项** — 确认 6 文件都改到：`git diff --stat` 应含 preload/index、preload/bridgeTypes、src/types/electronBridge、main/index、rendererBridge、ChapterWorkbench。漏 electronBridge 或 bridgeTypes 任一，renderer tsc 会因接口不匹配报错 —— build 绿即证三镜像对齐。
- [ ] **Step 5: 三态验收自查（对照 spec 验收标准）**
  1. 顶栏出现「导出 .md 文件」，在「复制全书 Markdown」右侧。
  2. 有正文时点导出 → Electron 弹 `showSaveDialog`（默认名 `书名.md`、md 过滤器）→ 选路径保存 → 文件内容与 5a 复制的 Markdown 完全一致（同一 `buildWholeBookMarkdown`）→ alert「全书 Markdown 已导出」。
  3. 保存框点取消 → 无 alert、无文件、无报错。
  4. 空书（无非空章节）点导出 → alert「暂无可导出的正文」，不弹保存框。
  5. 文件名含非法字符（如书名带 `:` `/`）→ 落盘文件名被 sanitize（双侧防御）。
  6. busy（AI 生成中）时按钮仍可点，导出正常（只读，不受影响）。
  7. 零落库：导出前后 `novel.json` hash 一致（导出不触发 saveNovel）。
  8. `npm run dev`（浏览器）点导出 → 触发 Blob 下载，文件名 `书名.md`。
- [ ] **Step 6: 提交**
  ```bash
  git add electron/preload/bridgeTypes.ts electron/preload/index.ts src/types/electronBridge.ts electron/main/index.ts src/services/rendererBridge.ts src/features/novel-creation/ChapterWorkbench.tsx
  git commit -m "feat: 增加导出全书 Markdown 文件"
  ```

---

## 自审记录（写完对照 spec）

- **Spec 覆盖**：IPC 签名 + 双侧 sanitize + 取消口径 + 空书 alert + busy 不禁用 + 边界后置清单 → 全部落到 Global Constraints 与各 Task。
- **6 文件类型链**：Task 1 覆盖三镜像（bridgeTypes / electronBridge / preload invoke），Task 2 main handler，Task 3 renderer 封装，Task 4 UI。build 绿即证三镜像对齐（renderer tsc 会因接口不匹配报错）。
- **占位符扫描**：无 TBD/TODO；所有代码步骤给完整代码。
- **不越界**：不提取 builder、不改 5a 格式、不做 txt/docx/历史/路径记忆 —— 均在 Global Constraints 明列后置。
