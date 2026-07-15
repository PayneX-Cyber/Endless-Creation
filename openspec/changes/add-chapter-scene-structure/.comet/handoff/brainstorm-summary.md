# Brainstorm Summary

- Change: add-chapter-scene-structure
- Date: 2026-07-15

## 确认的技术方案

正文权威模型从 `Chapter.content` 下沉到 `Scene.content`，交付完整四级写作（Novel → Volume → Chapter → Scene）。v7→v8 迁移。以下技术决策已全部经用户确认：

### D1. `chapterText(chapter)` 章内正文聚合（权威定义）
正文消费者（导出、字数/进度、Prompt 前文上下文、分析输入）统一通过此函数把章内多场景聚合成"整章正文"。权威实现：

```ts
orderedScenes(chapter)
  .map(scene => scene.content)
  .filter(content => content.trim())   // 只过滤空白场景
  .join('\n\n')                        // 段落级空行拼接
```

- **无缝拼接**：场景是写作组织单位，不泄漏到小说成品正文；场景标题/边界只活在编辑器，不进入导出内容。
- **空场景过滤**：只过滤 `trim()` 为空的场景，**不 trim 非空正文**（保留用户原文首尾空白，不动一个字符）。因 `scenes.length≥1` 不变量意味着空章=一个空场景，聚合时必遇空 content；过滤后空章聚合出空串（字数 0，与现状一致），且空场景不产生幽灵空行。

### D2. `orderedScenes(chapter)` 唯一场景展开入口
场景按 order 升序、order 相同以原数组位置稳定兜底；不原地修改入参。类比 change 1 的 `orderedChapters`。章内正文与场景的唯一展开入口。

### D3. `scenes.length ≥ 1` 不变量（三处守卫）
- 迁移：v7 每个 chapter（含空章、仅大纲无正文章）建恰好一个默认 Scene
- 新建章：`createChapter` 同步初始化一个默认 Scene（共用同一初始化逻辑）
- 删除场景：删到只剩 1 个时拒绝（删除按钮禁用）
默认场景持久化标题留空；UI 派生显示"场景 N"。迁移不虚构场景结构。

### D4. 撤销栈按 sceneId 隔离（最小语义，已钉死）
- 现有 `[activeChapterId]` reset effect 改锚 `activeSceneId`、读 `activeScene.content`
- 切换 Scene 即 reset（复用现有 `resetEditorHistory` 最小语义），与现在"切章清栈"同构
- **明确不做** `Map<sceneId, EditorHistory>` "切回恢复旧栈"——避免历史过期/场景被删等边界，YAGNI
- 删除当前场景时：选相邻场景（优先后一个，无则前一个）并清该场景历史
- 查找/替换作用目标改为当前激活场景的 `Scene.content`，替换写入进该场景历史栈

### D5. 流式续写下沉 scene 粒度
`runRef`/`requestIdRef`/`streamTextRef` 防串线机制不变，写入目标从 `activeChapter` 改 `activeScene`；切场景取消语义复用现有切章逻辑；AI 写回不进撤销栈保持不变。

### D6. 版本历史下沉 scene 粒度
`ChapterVersion`/`MAX_CHAPTER_VERSIONS`/`selectedVersionId` 整体从 Chapter 移到 Scene，`writeVersionToChapter`→`writeVersionToScene`；版本预览与写回 scene 粒度。

### D7. 字段与四份副本
- `filledChapterCount`/进度："有正文的章" = `chapterText(chapter)` 非空（该章至少一个场景有正文）
- `Scene` 接口 + `Chapter.scenes[]` 同步进四份协议副本（`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`）
- 删除 `Chapter.content` 字段（A1），由 TypeScript 编译期强制迁移所有消费点
- Electron `sanitizeNovel` 与 Web `normalizeWebNovel` 迁移语义对称一致
- version 7→8；所有纯函数返回新 Novel 不原地改

### D8. 锚点红线（保持 chapter 级）
伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId`、人物图谱继续锚定 chapterId；本 change 不新增持久化 sceneId 引用。搜索结果的 sceneId 仅为瞬时导航标识，不落库。分析输入按 `orderedScenes` 聚合章内正文，锚点粒度=chapter，正文粒度=scene（刻意不同）。

### D9. 会话态
`activeChapterId`/`activeSceneId` 均为 React 会话状态，不落库；重开小说默认激活首章首场景。

## 关键取舍与风险

- **取舍：撤销栈切场景即清栈（不做 Map 缓存）** — 换取实现简单、边界少、心智一致；代价是切回场景后无法撤销切走前的编辑（与现状切章行为一致，可接受）。
- **取舍：导出无缝拼接** — 场景结构不进成品；若将来要分镜本式显式场景导出，需另开 change。
- **风险：删除 `Chapter.content` 影响 97 处消费点** — 缓解：靠 tsc 编译期兜底当"消费者清单"，删字段后未迁移处直接编译红，一个不漏。
- **风险：大 tsx 文件（ChapterWorkbench/NovelCreation）Read 会损坏** — 缓解：改动靠 Grep 锚 ASCII 行 + CodeGraph 可信读取 + tsc 验证，不硬怼 sed 多行插入。
- **风险：迁移丢正文/版本** — 缓解：v7→v8 自检强制覆盖 content+versions+selectedVersionId 全量迁移 + 空章默认场景。

## 测试策略

沿用项目 `assertXxxSelfCheck()` 模块底部自检 + 文件尾调用模式，纯函数覆盖：
- `orderedScenes` 稳定排序（同 order 原位置兜底）
- 场景 CRUD + 删到最后一个被拒（`scenes.length≥1`）
- `chapterText` 空场景过滤（不 trim 非空正文）
- **v7→v8 迁移自检（核心）**：`content`、`versions`、`selectedVersionId` 全量迁入默认场景；空章建空默认场景
编辑器分场景/撤销栈隔离/流式续写/版本下沉靠 `npm.cmd run build`（tsc+Vite / Electron tsc exit 0）+ 文本完整性扫描 + GUI 真机验收。

## Spec Patch

无。open 阶段四个 delta spec 已覆盖全部验收场景，本次深度设计未发现需回写的场景缺口或歧义。
