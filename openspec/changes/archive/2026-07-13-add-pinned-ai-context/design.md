## Context

长篇写作中，AI 续写（`buildChapterFromOutlinePrompt`）与一致性检查（`buildChapterConsistencyPrompt`）的上下文只来自固定字符窗口（本章尾部、上一章尾部、前文章节摘录），看不到早期章节的关键设定与伏笔。项目已有两类结构化数据可复用：

- `SettingEntry`（`novelSettings.ts`）：`{ id, type, title, body }`，type 覆盖 character/location/organization/item/term/rule/other。
- `Foreshadowing`（`types/novel.ts`）：`{ id, title, plantedChapterId, status, payoffChapterId?, note? }`。

它们目前完全不进入任何 AI prompt。本 change 让用户手动钉选少量条目，注入这两处调用。

**约束：**
- 本地优先，零新依赖，不上向量库/语义检索（RAG 是阶段六后置）。
- 成本可见是项目优先级：注入点越多，每次调用 token 越贵。
- `Novel` schema 有三份接口副本（`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`），改字段必须三处同步 + 迁移。这是本模块首次为"辅助态"数据破"走 localStorage 不动 schema"的既有惯例。
- 编辑纪律：`NovelCreation.tsx`/`ChapterWorkbench.tsx` 是大 tsx，Read 会渲染幻影字节，改动走 Grep + Edit 锚 ASCII，中文文案进独立模块文件。

## Goals / Non-Goals

**Goals:**
- 用户从已有设定/伏笔手动钉选少量条目（合计硬上限 8）。
- 钉选内容注入续写 + 一致性检查两处 prompt。
- 钉选状态进 `Novel` schema（v4→v5），走 `saveNovel` 持久化、进导出、跨设备保留。
- 悬空引用（已删除的被钉条目）注入时静默过滤，不报错、不阻断。

**Non-Goals:**
- 不做语义检索/自动召回/向量库（RAG 后置）。
- 不注入 review/rhythm/optimize 三处调用。
- 不引入新依赖、不做卷/场景层级、章节重排、全文搜索。
- 不改造导出逻辑本身（字段随 Novel 序列化自然进入即可）。

## Decisions

### D1：钉选状态存 Novel schema（v4→v5），而非 localStorage
`Novel` 新增 `pinnedSettingIds?: string[]` 与 `pinnedForeshadowingIds?: string[]`，`version: 4 → 5`。
- **为什么不选 localStorage**：情感曲线/图谱/伏笔候选都走 localStorage，导致"数据不进导出、不跨设备"的债。钉选是创作意图的一部分，应随作品走。此处一次性还债。
- **代价**：三份接口副本同步 + 主进程加迁移。属本 tweak 里偏重的部分，用迁移测试兜底（见 Migration Plan）。
- **迁移方向**：加载老小说（version 4）时补两个空数组、置 version 5，不丢原数据；复用现有 version 迁移位置（主进程 loadNovel/normalize 路径）。

### D2：注入点锁定续写 + 一致性两处
- 续写（`buildChapterFromOutlinePrompt`）：AI 失忆最直接受害者，注入收益最高。
- 一致性检查（`buildChapterConsistencyPrompt`）：本就为查设定漂移，钉选设定是它的天然输入。
- review/rhythm/optimize 不注入：review/rhythm 关注文笔节奏、optimize 只处理选区，与固定设定关联弱，且每处注入都摊 token 成本。

### D3：注入内容为"当前钉选且仍存在"的条目，纯函数组装
新增一个纯函数（放 `novelPrompts.ts` 或 `novelShared.ts`），输入 `novel` + 钉选 id 列表，输出注入文本段：
- 按 `pinnedSettingIds`/`pinnedForeshadowingIds` 从 `novel.settings`/`novel.foreshadowings` 查回实体，**查不到的 id 直接跳过**（悬空引用容错）。
- 设定输出 `type 标签 + title + body`；伏笔输出 `title + status + note`。
- 全空（无钉选或全部悬空）时返回空串，prompt 不加该段——不产生空标题噪声。
- 纯函数无 IO、可单测（照 `emotionArc.ts` 的 `assertEmotionArcSelfCheck` 模式加运行时自检）。

### D4：硬上限 8，合计计数，UI 层与注入层双重保障
- 计数 = `pinnedSettingIds.length + pinnedForeshadowingIds.length`，达 8 时 UI 禁用继续钉选并提示。
- 注入层同样 `slice`/截断到上限，防止手工改档或迁移遗留导致超量注入撑爆 token。

### D5：钉选 UI 入口复用现有面板
- 设定钉选入口放 `SettingPanel.tsx`，伏笔钉选入口放 `ForeshadowingPanel.tsx`，每条加钉/取消钉的切换。
- 不新建独立"钉选管理"面板——避免多入口，复用用户已熟悉的设定/伏笔列表。
- 钉选态变更走现有 `onUpdateNovel`/`saveNovel` 链，无新增 IPC。

## Risks / Trade-offs

- **[schema 迁移破坏老档] → Mitigation**：迁移只增字段补空数组、不改既有字段；写迁移测试覆盖"v4 老小说加载→v5、字段默认空、原数据完整"。四禁改文件里的其余字段零改动，git show --stat 核实。
- **[三份接口副本漂移] → Mitigation**：三处字段定义必须逐字一致；build 双端 tsc 会抓类型不一致。
- **[注入撑爆 token / 成本失控] → Mitigation**：硬上限 8 + 仅两处注入 + 注入层二次截断；token 增量走现有成本追踪可见。
- **[悬空引用致生成报错] → Mitigation**：注入前按当前存在实体过滤，查不到即跳过，纯函数单测覆盖此路径。
- **[大 tsx 编辑损坏] → Mitigation**：走 Grep + Edit 锚 ASCII 行，中文进独立模块，不 bash 转储判字节（见项目编辑纪律）。

## Migration Plan

1. 三份 `Novel` 接口副本同步加 `pinnedSettingIds?`/`pinnedForeshadowingIds?`，`version: 5`。
2. 主进程 loadNovel 归一化路径加 v4→v5 迁移：缺字段补 `[]`，置 version 5。
3. 无回滚脚本需求（纯增字段，v5 档在旧代码里多余字段被忽略、不崩溃——但一旦写入 v5 不建议回退旧版本运行）。
4. 验证：迁移自检 + build 双绿 + 真机加载一本老档确认不丢数据。

## Open Questions

- 注入文本放 system 段还是 user 段、`body` 是否需按长度截断——留 build 阶段按 prompt 真实字节校准（`generateText` 的 messages 结构以 grep 现状为准，不臆造）。
- 伏笔注入是否区分 planted/paidOff 状态给不同措辞——倾向统一带 status 字段，build 时定。
