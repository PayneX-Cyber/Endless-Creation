# persist-emotion-graph 验证报告

日期：2026-07-13
模式：full
基准：`ad1fee0763d89d3ee262cac431d1034e1bb19f8c`
实现提交：`8112e28`（计划状态提交：`2bc6155`）

## 结论

代码层与 GUI 真机验证通过，无 CRITICAL、IMPORTANT。OpenSpec 3 个 requirement / 12 个 scenario 均有实现证据。

| 维度 | 结果 |
|---|---|
| Completeness | tasks 20/20；3 个 requirement 均已实现 |
| Correctness | 12 个 scenario 均有代码路径；迁移运行时自检与 GUI 验收通过 |
| Coherence | 遵循 Novel v6、renderer 惰性迁移、先保存后删除、Novel 唯一权威源 |

## 新鲜验证证据

- `npm.cmd run build`：renderer Vite + Electron tsc 通过，exit 0。
- 迁移运行时自检：`MIGRATION SELF-CHECK OK`。
  - 双字段一次保存迁移；
  - 合法空成果不覆盖；
  - 保存失败保留旧数据；
  - 损坏 JSON 保留且不触发保存；
  - 崩溃残留清理；
  - 同表其他 novelId 保留。
- 文本完整性扫描：`TEXT INTEGRITY OK`。
- `git diff --check`：干净。
- `npx.cmd openspec validate persist-emotion-graph --strict`：通过。
- 自动代码审查按 `review_mode: off` 跳过；已人工核对本 change diff 的正确性、数据安全顺序与边界条件。

## Requirement / scenario 对照

### 分析成果纳入 Novel schema

- Novel schema v6 与两字段：`src/types/novel.ts:45-90`。
- Electron preload/main 协议同步：`electron/preload/bridgeTypes.ts:151-195`、`electron/main/index.ts:159-204`。
- 主进程消毒保留合法成果、非法/缺失为 undefined：`electron/main/index.ts:685-758`。
- Web fallback 同语义：`src/services/rendererBridge.ts:473-515`。
- 情感曲线写入 Novel：`src/features/novel-creation/EmotionArcPanel.tsx:172-183`。
- 人物图谱写入 Novel（含合法空图谱）：`src/features/novel-creation/NovelCreation.tsx:724-736`。
- 导出继续直接序列化 Novel，无需改导出协议。

### localStorage 存量数据惰性迁移

- 加载后、写 React state 前迁移：`src/features/novel-creation/NovelCreation.tsx:214-228`。
- 只在字段严格为 undefined 时迁入：`src/features/novel-creation/novelAnalysisPersistence.ts:69-77`。
- 两字段合并后最多保存一次：`src/features/novel-creation/novelAnalysisPersistence.ts:72-85`。
- 字段已有时不覆盖；合法残留仅清理：`src/features/novel-creation/novelAnalysisPersistence.ts:89-95`。
- 整表 JSON 或条目结构损坏时不迁、不删：`src/features/novel-creation/novelAnalysisPersistence.ts:13-45,63-70`。

### 迁移的数据安全顺序

- `await saveNovel` 成功后才删除：`src/features/novel-creation/novelAnalysisPersistence.ts:79-84`。
- 保存失败/抛错返回原 Novel 且不删除：`src/features/novel-creation/novelAnalysisPersistence.ts:80-87`。
- 删除只移除当前 novelId，保留同表其他条目：`src/features/novel-creation/novelAnalysisPersistence.ts:47-56`。
- localStorage 清理失败仅留下可重试残留，不影响已落盘 Novel。

## GUI 真机验收

使用隔离的浏览器 renderer 实例完成，不触碰真实 Electron 用户资料：

1. 创建验收小说并注入两份合法旧成果；重新打开后，情感曲线与人物图谱同时进入 Novel v6，只触发一次持久化。
2. 人物图谱面板显示迁入角色“林川”；情感曲线面板正常读取合法空成果。
3. 两个旧表只删除当前 novelId，`other` 条目保留。
4. 向已有合法空 EmotionArc / 已有 CharacterGraph 注入不同合法残留；重开后 Novel 字段未被覆盖，残留条目被清理。
5. 注入损坏 JSON 与结构错误图谱；重开正常、Novel 字段不变、两份坏数据均保留。
6. 导出离线包并解压检查：`novel.json` 为 version 6，包含完整 `emotionArc` / `characterGraph`。
7. 保存失败路径由迁移运行时自检覆盖；新 AI 分析/推演因验收环境不注入真实 API 凭据，按真实写回代码路径核验。
8. 唯一控制台错误为既有 `favicon.ico` 404，与本 change 无关。
9. 验收小说、旧存储键、下载包和浏览器会话均已清理；localStorage 恢复为仅保留原 `ec-theme`。
