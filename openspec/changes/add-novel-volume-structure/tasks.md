## 1. Schema v7 与兼容迁移

- [x] 1.1 在 `src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts` 同步新增 `Volume`、`Novel.volumes`、`Chapter.volumeId?`，并将 Novel version 从 6 升为 7；保持 `NovelSummary` 不新增 `volumeCount`
- [x] 1.2 扩展主进程 `sanitizeNovel`：先消毒并归一卷，再校验章节 `volumeId`，将无效归属降级为未分卷，按分组归一 chapter order；v6 老章节保持相对顺序且不自动建卷
- [x] 1.3 更新 Electron `createNovel` 与 renderer Web fallback 的 `createNovel` / `normalizeWebNovel`：新小说初始化 `volumes: []`、version 7，Web 预览与 Electron 使用同一迁移语义

## 2. 统一卷序与结构变更函数

- [ ] 2.1 新建独立小模块实现 `orderedChapters(novel)` 与 UI 分组函数：正式卷按 volume order、卷内按 chapter order、未分卷恒定居末；排序不得原地修改 Novel
- [ ] 2.2 在同一模块实现卷创建/重命名/重排/安全删除，以及章节卷内重排、跨卷移动、移入未分卷；所有入口共用同一归属更新与源/目标分组 order 归一逻辑
- [ ] 2.3 为卷序和结构纯函数补充项目现有风格的自检，覆盖 v6 未分卷、稳定排序、组内归一、跨卷移动、删除卷不删章和无效 volumeId 降级

## 3. 顺序消费者统一接入

- [ ] 3.1 改造 `NovelCreation`、`ChapterWorkbench` 与 `novelNavigation`：章节列表、激活首章、跨章搜索结果顺序和章号均来自统一卷序，不再自行全局按 chapter order 排序
- [ ] 3.2 改造 `novelExport` 与 Prompt 调用链：整书导出、离线包结构、前一章上下文、缺失大纲等需要先后关系的输入统一按卷序展开
- [ ] 3.3 改造 `NovelStats`、`EmotionArcPanel`、`characterGraph` 及其余顺序消费者，确保“第 N 章”和分析输入一致；扫描并清理遗留的直接全局 chapter order 排序点
- [ ] 3.4 保持伏笔、情感曲线、人物图谱和分析持久化的 `chapterId` 引用原样，确认计数/按 id 查找等与顺序无关的逻辑没有被误改

## 4. 卷管理与分组导航 UI

- [ ] 4.1 在独立小组件/文案模块中实现卷管理头部：新建、非空重命名、上移/下移、删除确认；删除提示受影响章节数并明确章节只移入“未分卷”
- [ ] 4.2 将“章节大纲”页改为正式卷 + 未分卷的分组列表，接入卷 CRUD、卷内上移/下移、原生拖拽换位/跨卷放置和章节卷归属选择控件
- [ ] 4.3 将“章节内容”页与工作台左侧章节导航改为只读卷分组展示，维持 active chapter、搜索定位、生成中 busy gate 和正文编辑流程
- [ ] 4.4 完成卷区、放置目标、空态与响应式样式；上移/下移/删除/归属控件具有明确 aria-label，边界按钮禁用，键盘用户无需拖拽即可完成全部结构操作

## 5. 持久化与回归边界

- [ ] 5.1 所有卷 CRUD、卷排序、归卷和重排均通过现有 `updateNovel` → 自动保存 → `saveNovel(novel)` 链持久化，不新增卷专用 IPC 或依赖
- [ ] 5.2 覆盖损坏/缺失 volumes、孤儿 volumeId、空卷、删除当前卷、跨卷移动当前激活章节等边界，保证章节 id、正文、版本历史和引用数据不丢失

## 6. 验证与交付

- [ ] 6.1 运行 `npm.cmd run build`，确保 renderer tsc + Vite 与 Electron tsc 全部 exit 0
- [ ] 6.2 运行文本完整性扫描 `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"` 并得到 `TEXT INTEGRITY OK`；运行 `git diff --check` 无空白错误
- [ ] 6.3 GUI 真机验收 spec 场景：卷 CRUD/确认删除、卷排序、归卷/移出/跨卷、拖拽与键盘路径、未分卷末尾、重启持久化、搜索章号及导出/Prompt/统计/图谱顺序一致
- [ ] 6.4 逐项勾选 tasks 后，仅提交本 change 的源文件与 artifacts，保持平台/工具未跟踪目录不入库，并以单个 coherent feature commit 收口
