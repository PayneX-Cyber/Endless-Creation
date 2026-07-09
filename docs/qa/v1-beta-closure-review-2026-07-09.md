# V1 Beta 收口复核报告

日期：2026-07-09

## 结论

Phase 2/3 的本地 Beta 核心闭环代码层已具备：导出、成本看板、小说正文保存、人物图谱恢复、AI usage 记录均有明确入口与持久化路径。下一步不进入支付/套餐/OSS，先做一轮真实狗粮 QA，只修阻断或明显体验 Bug。

## 导出闭环

- Markdown：`ChapterWorkbench.tsx` 顶栏「导出 .md 文件」调用 `buildWholeBookMarkdown`，空正文提示「暂无可导出的正文」，Electron 走保存对话框，Web 走 Blob 下载。
- Word：顶栏「导出 Word 分镜本」调用 `buildStoryboardDocHtml`，内容含概要、创意、蓝图、章节大纲/正文、伏笔清单，Electron 以 `.doc` 写入 HTML Word 文档。
- ZIP：顶栏「导出离线包 ZIP」调用 `createStoreZip(buildOfflinePackageFiles(novel))`，包内含 `index.html`、`novel.md`、`novel.json`、`README.txt`。
- 代码层风险：ZIP 当前是 store-only 无压缩包，适合小型本地包；未来有大量图片/音频资源时再接压缩库或资源归档。

## 成本闭环

- 主进程 `safeRecordAiUsage` 写入 `ai-usage-records.json`，字段含 `projectId/provider/model/inputTokens/outputTokens/estimatedCost/requestType/success/createdAt`。
- 价格表已让 `estimatedCost` 非零；未知模型走兜底价。
- 流式生成若 provider 不返回 usage，会按 prompt/输出字符估算 token，不记 0。
- 前端 `NovelStats` 按 `novel.projectId ?? 'default'` 加载项目级 usage，展示调用数、成功数、输入/输出 tokens、估算成本。
- 代码层风险：成本是本地估算，不等于 provider 实际账单；Beta 只用作量级和项目对比。

## 本地数据风险

- 小说正文：Electron 正式环境走 `novel:save-novel` 持久化到本地 novel JSON；Web 预览才走 localStorage fallback。
- 人物图谱：按 `novelId` 保存到 `endless-creation.novel-character-graphs`，切换/重启后从 localStorage 恢复；空推演也写回，避免旧图误显示。
- AI usage：Electron 正式环境写 `ai-usage-records.json`；读取支持按 `projectId` 过滤。
- 代码层风险：人物图谱目前不是 `novel.json` schema 字段；清 localStorage 会丢图谱，但不影响小说正文。

## 二轮狗粮验收

建议真实跑一遍：

1. 创建或打开一篇小说，确认项目详情、章节列表、正文均正常。
2. 生成一章正文，确认流式显示、取消不串线、确认写入后刷新仍保留。
3. 生成人物关系图谱，切走再回来或重启后确认图谱仍保留。
4. 查看项目概览成本看板，确认 tokens 和估算成本非零且归到当前项目。
5. 分别导出 Markdown、Word、ZIP，打开文件确认内容可读。

只修复阻断或明显体验 Bug；不在这轮引入支付、套餐、OSS、移动端。
