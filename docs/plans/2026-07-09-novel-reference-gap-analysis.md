# 小说创作模块 — 参考项目差距分析

日期：2026-07-09
定位：**纯分析文档，不含实现。** 对照 11 个开源 AI 小说项目，盘点当前 Endless Creation 小说模块的能力位置与缺口，归纳三个补齐包并排优先级，作为后续派单的对照基线。具体实现按包另开规格。

---

## 1. 目的与背景

`docs/plans/2026-06-30-novel-creation-migration-plan.md` 的迁移计划（NovelForge → Endless Creation，六阶段）已推进到阶段五收口。本文在此基线上，用 11 个同类开源项目做横向对照，回答一个问题：**当前小说模块还有哪些真实用户会用到、而我们没有的能力？**

调研由并行研究得出（每个项目读 README/docs，非记忆）。本文的"当前已有"均对照 2026-07-09 代码实况核实。

---

## 2. 调研范围（11 个参考项目）

| 项目 | 形态 | 架构 | 本地优先 |
| --- | --- | --- | --- |
| all666666all/AI-novel-NovelForge | Web 应用 | Vue3 + FastAPI + SQLite/libsql | 否（云/多用户 JWT） |
| YILING0013/AI_NovelGenerator | 桌面 GUI | Python Tkinter，文件存储 | 是（含 Ollama） |
| vkbo/novelWriter | 桌面编辑器 | Python + Qt6，纯文本文件 | 是（无 AI） |
| RhythmicWave/NovelForge | 桌面应用 | Electron+Vue3 + FastAPI + SQLite/Neo4j | 是 |
| ExplosiveCoderflome/AI-Novel-Writing-Assistant | Web+Electron | React + Express + LangGraph + SQLite/Qdrant | 是（SQLite 默认） |
| leenbj/novel-creator-skill | Skill/框架 | Markdown + Python，跑在 CLI Agent 里 | 是（文件） |
| Narcooo/inkos | CLI/TUI/Studio | React+Hono，文件 + SQLite | 是 |
| Deng-m1/MaliangAINovalWriter | 云平台 | Flutter + SpringBoot + MongoDB + Chroma | 否（多租户/订阅） |
| inliver233/Ai-Novel | Web 应用 | React + FastAPI + Postgres/SQLite | 否（云/OIDC） |
| zqaini002/Novel_Wonderful-generation | 阅读分析 | Vue3 + SpringBoot + MySQL + HanLP | 否（非创作工具） |
| xindoo/ai-novel-lab | 单一作品+工具 | 手写 .md + Python 脚本 | 是（文件+git） |

**架构最接近我们（Electron 本地优先）的对标：** RhythmicWave/NovelForge、inkos、AI-Novel-Writing-Assistant。它们的取舍最有参考价值；云平台类（Maliang、Ai-Novel、all666666）的能力可借鉴，但架构不照搬（撞我们"本地优先、不上重型依赖直到阶段六"约束）。

---

## 3. 能力矩阵（当前模块 vs 参考项目）

`✅ 已有` / `🟡 部分/V0` / `❌ 空白`

| 能力 | 当前 Endless Creation | 参考项目普遍程度 |
| --- | --- | --- |
| 本地 CRUD + 章节编辑 | ✅ | 普遍 |
| 灵感→蓝图→大纲→正文 生成链 | ✅ | 普遍 |
| 多版本草稿（择优） | ✅ | 常见 |
| 审校 / 一致性 / 节奏检查 | ✅ 三检查 | 常见 |
| 伏笔记录 + AI 埋设/回收候选 | ✅ | 常见（多为 open loop） |
| SSE 流式 + 打字机 | ✅ | 常见 |
| 成本追踪（按小说隔离） | ✅ | 少见（仅 Maliang 深做） |
| MD / Word / ZIP 导出 | ✅ | 常见 |
| 人物关系图谱 | 🟡 V0（AI 推演、localStorage、不可结构化编辑） | 常见（多为结构化+可编辑+知识图谱） |
| **稿件导入 + 自动分章** | ❌ **完全空白** | 常见 |
| **多格式导入（docx/epub）** | ❌ | 少见（多数只 txt/预设格式） |
| **结构化设定（世界书/角色卡/术语表/组织）** | ❌ | 强项集中区 |
| **设定变更 changeset apply/rollback** | ❌ | 少见（Ai-Novel 有） |
| **卷/场景层级** | ❌（仅 Novel→Chapter 两层） | 常见 |
| **字数目标 / 进度表 / 章节状态** | ❌ | 常见 |
| **质量门禁（过关才解锁下一章）** | ❌ | 常见（leenbj/inkos/RhythmicWave） |
| 知识图谱 / RAG 记忆 | ❌（阶段六，明确后置） | 云平台类有 |

**诚实定位：** 生成链、多版本、三检查、伏笔、流式、成本隔离、导出这一套，已追平甚至超过约半数参考项目（YILING、xindoo、NovelSight、all666666 的部分能力我们都有）。真正比我们成熟的是 4 个：RhythmicWave、inkos、Maliang、Ai-Novel。差距集中在下面三个包。

---

## 4. 三个补齐包与优先级

### 包 ① 导入与解析包 —— 最大空白，建议下一步做
- **覆盖：** 稿件上传、多格式导入（txt/md 先行，docx/epub 后补）、章节自动识别、AI 摘要/标签回填、项目 Bundle 导入导出。
- **为什么第一：** 这是三个包里**唯一"从有到无"的空白**（另两个是"从浅到深"）。真实用户大概率不是空白开书，而是带已有稿子进来继续写；没有导入，这批用户直接卡在门口。
- **差异化位：** 多格式（docx/epub）+ AI 自动分章，11 个项目里几乎没人做全——NovelSight 有解析但不能编辑，Maliang/inkos 要预设分章格式或 txt。我们做成"导入即可继续写"是空位。
- **参考：** Maliang（txt 智能分章 + LLM 回填每章大纲）、inkos（`import chapters` 自动分章 + 摘要 + 伏笔 + 关系回填、可续写）、NovelSight（TXT/EPUB + 自动章节检测 + 摘要标签）、RhythmicWave（拆书工作流）、AI-Novel-Writing-Assistant（拆书工作台）。

### 包 ② 设定与记忆包 —— 深度差距，第二优先
- **覆盖：** 世界书、角色卡、地点/组织/术语表、open loops、story memories、结构化设定树、关系网络、设定变更 changeset。
- **现状：** 只有伏笔（结构化）+ 人物图谱 V0（AI 推演、不可结构化编辑）。
- **⚠️ 约束冲突：** 这个包直接撞 6-30 迁移计划"阶段一禁止骨架/世界观/角色卡"的克制约束。**要做得先解禁**，是产品决策，不能默拍。
- **参考：** Ai-Novel（世界书 CRUD + 角色卡 + 术语表 + story memories + open loops + changeset apply/rollback）、RhythmicWave（卡片系统 + 知识图谱 + schema 驱动）、inkos（9 类事实 + open loop 生命周期 open/progressing/deferred/resolved）、Maliang（结构化设定树 + 关系网络 + 版本快照）。

### 包 ③ 长篇写作管理包 —— 第三优先
- **覆盖：** 卷/章/场景层级、字数目标、进度表、章节状态、设定快照、质量门禁。
- **现状：** Novel→Chapter 两层 + 版本快照，无卷/场景层级、字数目标、进度表、章节状态、质量门禁。
- **参考：** novelWriter（标题层级驱动卷/章/场景 + 字数 + 状态标签，最成熟的组织模型）、RhythmicWave（卷→阶段→章 + 审校门禁）、inkos（37 维审校门禁）、leenbj（5 步质量门禁、过关才解锁下一章）。

---

## 5. 导入与解析包 —— 落地建议（供后续规格细化）

### 当前可复用件（已核实 2026-07-09 代码）
- `src/features/novel-creation/novelPrompts.ts` 的 `OUTLINE_HEADER_PATTERN`：已能识别 `第X章/回/节`、`Chapter N`、`N.` 等章节头，可复用为分章基础（当前用于大纲解析，需派生一个"标题 + 正文"变体，而非"标题 + 大纲行"）。
- `electron/main/index.ts` 的 `createNovel`：可建项目，但**当前只接 title/summary/note，不接 chapters**——导入要么扩 createNovel 收章节数组，要么建空项目后逐章 `saveNovel` 写入。
- 章节写入链：`saveNovel` 原子写（temp→rename）+ 按 id 串行队列，导入批量写章节可直接复用。

### 需新增
- **"打开文件 + 读文本"的 IPC**：当前 `showOpenDialog` 只用于选目录（`openDirectory`），**没有读文本文件的通道**。需新增 `app:open-text-file`（`properties: ['openFile']` + `fs.readFile`），或复用 dialog + 读取。这是导入包的地基改动。

### 首版范围建议（待 PO 拍）
- **锁 V0：** txt/md 导入 + 自动分章（复用 `OUTLINE_HEADER_PATTERN`）+ 建项目/写章节。纯本地，零 AI，零新依赖。
- **第二步：** AI 摘要/大纲回填（复用现有 `generateText` 管道 + 成本追踪）。
- **后置：** docx/epub 解析（需引入解析库，撞"不上重型依赖"约束，需单独批）、项目 Bundle 导入导出。

### 约束（沿用既有）
- 本地优先、零重型依赖（docx/epub 解析库需单独评估触发条件）。
- 章节识别失败要有兜底（整篇作为单章导入 + 提示手动分章），不静默吞内容。
- 导入是"新建项目"，不覆盖现有项目（防误删已有稿）。
- 遵守 [[read_tool_corrupts_chapterworkbench]] 的编辑纪律：改 NovelCreation.tsx 走 Grep + Edit 锚 ASCII，中文进新模块文件。

---

## 6. 待 PO 拍板项

1. **导入包首版范围**：是否锁"txt/md + 自动分章 + 建项目"，docx/epub 与 AI 摘要回填放第二步？
2. **包 ② 的克制约束解禁**：设定与记忆包撞 6-30"阶段一禁止角色卡/世界观"，是否解禁、何时做？
3. **三包顺序**：是否确认 ①→②→③，还是 ③（长篇管理，纯前端低风险）插到 ② 之前？

---

## 7. 附：交付纪律（沿用本轮教训）

- 一个包一次收口，验收看整包体验，不再单点拆刀（见 [[feedback-no-over-fine-slicing]]）。
- 每步 `npm run build` 双绿 + text integrity 扫描；真实 commit hash 以 PO 本地 git 为准（见 [[git-commit-hash-unreliable]]）。
- 改乱码文件用 Grep + Edit 锚 ASCII，不用 bash 文本转储判字节。
