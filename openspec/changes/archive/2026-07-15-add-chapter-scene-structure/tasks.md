## 1. Scene schema v8 与兼容迁移

- [x] 1.1 在 `src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts` 同步新增 `Scene` 接口与 `Chapter.scenes: Scene[]`，删除 `Chapter.content` 字段，并将 Novel version 从 7 升为 8；`ChapterVersion`、`selectedVersionId` 随正文一并下沉到 `Scene`
- [x] 1.2 扩展主进程 `sanitizeNovel`：v7 每个 chapter（含空章、仅大纲无正文章）建恰好一个默认 Scene，v7 的 `content`/`versions`/`selectedVersionId` 原样迁入默认场景；默认场景持久化标题留空；损坏/缺失 scenes 归一为至少一个空场景，场景 order 按分组归一
- [x] 1.3 更新 Electron `createNovel`/`createChapter` 与 renderer Web fallback 的 `normalizeWebNovel`：新章初始化恰好一个默认场景、version 8；Web 与 Electron 迁移语义对称一致

## 2. orderedScenes 与场景结构纯函数

- [x] 2.1 新建独立小模块实现 `orderedScenes(chapter)`：场景按 order 升序、order 相同以原数组位置稳定兜底；不原地修改入参
- [x] 2.2 在同一模块实现场景创建/重命名/排序/安全删除，以及默认场景初始化的共用逻辑；删除到最后一个场景时拒绝（保证 `scenes.length ≥ 1`）；所有入口共用同一 order 归一逻辑
- [x] 2.3 实现章内正文聚合 `chapterText(chapter)` = `orderedScenes` 正文按序拼接，供字数/导出/Prompt/分析统一消费
- [x] 2.4 为场景纯函数补充项目现有风格的自检，覆盖默认场景不变量、稳定排序、组内 order 归一、删到最后一个被拒、迁移聚合

## 3. 分场景编辑器与撤销栈隔离

- [x] 3.1 `ChapterWorkbench` 改为分场景编辑：新增 `activeSceneId` 会话态，切章默认激活首场景，场景切换切换编辑目标
- [x] 3.2 场景管理 UI：章内场景列表、场景大纲、新建/重命名/排序/删除，最后一个场景删除按钮禁用，控件具备明确 aria-label
- [x] 3.3 撤销/重做历史栈隔离键从 `chapterId` 改为 `sceneId`：切换场景即清栈，删除当前场景仅清除该场景历史并激活相邻场景，跨场景/跨章不串栈
- [x] 3.4 查找/替换作用目标改为当前激活场景的 `Scene.content`，替换写入进该场景历史栈

## 4. 场景级版本历史与 AI 续写

- [x] 4.1 版本历史（`ChapterVersion` 快照）、`selectedVersionId`、版本预览与写回全部下沉为场景粒度
- [x] 4.2 AI 流式续写落到当前激活场景，写回与取消防串线按 scene 粒度；AI 写回不进撤销栈保持不变

## 5. 正文消费者编译期迁移

- [x] 5.1 删除 `Chapter.content` 后，`novelExport`、`novelProgress`/`NovelStats` 字数、`novelPrompts` 前文上下文改读 `chapterText(chapter)` 聚合；`NovelSummary.wordCount`/`filledChapterCount` 按场景聚合重算
- [x] 5.2 `characterGraph`、`emotionArc` 分析输入改按 `orderedScenes` 聚合章内正文；伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId`、图谱锚点保持 chapterId 不变，本 change 不新增持久化 sceneId 引用
- [x] 5.3 全仓扫描并消灭残留 `chapter.content` 直接引用，由 tsc 编译期兜底确认所有消费点已迁移

## 6. 搜索纳入场景与场景内定位

- [x] 6.1 跨章搜索扫描范围纳入场景标题/大纲/正文，结果携带章号、场景号与瞬时 `sceneId`（不落库）
- [x] 6.2 正文命中定位：先激活章与对应场景，再在该场景 textarea 选中并滚动到命中位置；章级/大纲命中仅切章并默认激活首场景；定位失效不报错

## 7. 验证与交付

- [x] 7.1 运行 `npm.cmd run build`，确保 renderer tsc + Vite 与 Electron tsc 全部 exit 0
- [x] 7.2 运行文本完整性扫描 `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"` 得 `TEXT INTEGRITY OK`；`git diff --check` 无空白错误
- [x] 7.3 GUI 真机验收 spec 场景：v7→v8 迁移（含空章）、场景 CRUD/删到最后一个禁删、分场景编辑与撤销栈隔离、AI 续写/版本 scene 粒度、字数/导出/Prompt/分析按场景聚合、搜索场景内定位、重启持久化默认激活首章首场景、分析锚点仍按 chapterId
- [x] 7.4 逐项勾选 tasks 后，仅提交本 change 的源文件与 artifacts，保持平台/工具未跟踪目录不入库，并以单个 coherent feature commit 收口
