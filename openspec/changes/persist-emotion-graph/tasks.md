## 1. Schema 扩展（v5→6，四副本同步）

- [x] 1.1 `src/types/novel.ts`：`Novel` 新增 `emotionArc?` / `characterGraph?` 两字段（可选，缺省 undefined）；`EmotionArc` / `CharacterGraph` 类型定义纳入 schema（从 emotionArc.ts / 图谱模块提升或 re-export）；NOVEL_SCHEMA_VERSION 5→6
- [x] 1.2 `electron/preload/bridgeTypes.ts`：同步新增两字段 + version 6
- [x] 1.3 `electron/main/index.ts`：本地 Novel interface 副本同步两字段 + version 6
- [x] 1.4 `src/services/rendererBridge.ts`：同步新增两字段 + version 6
- [x] 1.5 四副本字段命名/可选性/类型逐一核对一致

## 2. 版本迁移消毒（主进程 sanitizeNovel）

- [x] 2.1 `sanitizeNovel`：version 强制 6；`emotionArc`/`characterGraph` 字段类型校验，合法保留、**非法或缺失置 undefined，绝不合成任何空成果对象**——补空对象会使 renderer 迁移探测永不触发
- [x] 2.2 v4/v5 老 Novel 经此保持字段缺省（undefined）、chapters/settings/foreshadowings 等原样保留（不读 localStorage、不搬运）

## 3. 存量数据惰性迁移（renderer 层）

- [x] 3.1 触发条件严格为**字段 undefined**（非"字段为空"）：`novel.emotionArc === undefined` 且 localStorage `endless-creation.novel-emotion-arcs` 有该 novelId 条目 → 读出 → 结构校验 → 写入字段 → await saveNovel → 成功后删该 novelId 条目
- [x] 3.2 图谱同理：`novel.characterGraph === undefined` 且 localStorage `endless-creation.novel-character-graphs` 有该 novelId 条目 → 同一"先写成功再删条目"流程
- [x] 3.3 幂等 + 合法空成果保护：字段非 undefined（含 `points` 为空但仍含 `updatedAt` 的合法 `EmotionArc`，以及 `{ characters: [], relationships: [] }` 的合法 `CharacterGraph`）时跳过写入、不覆盖、不重复迁移；localStorage 无对应条目时不迁移、字段保持 undefined、不报错
- [x] 3.4 崩溃残留清理：字段已有数据但该 novelId **可解析且结构合法**的旧条目仍存在（saveNovel 成功后、删除前曾崩溃）→ 不覆盖字段、直接删除该残留条目
- [x] 3.5 坏数据容错优先：所有迁移/清理先解析并校验；localStorage 条目 JSON 解析失败或结构校验不通过 → 小说正常加载、保留旧条目不删、不写入 Novel 字段，即使 Novel 字段已有数据也不进入残留删除分支
- [x] 3.6 数据安全：saveNovel 失败/中断时保留 localStorage、不删条目（下次加载可安全重试）；删除仅移除该 novelId 条目、不影响同键其他小说

## 4. 读写源切换（localStorage 写路径下线）

- [x] 4.1 `emotionArc.ts`：getItem（:71）/ setItem（:92）改为读写 `novel.emotionArc`，upsert 经 saveNovel 落库
- [x] 4.2 `NovelCreation.tsx` 图谱：`saveCharacterGraph`（:729/734/1302-1305）/ `readLocalStorage`（:1298）改为读写 `novel.characterGraph`，走 updateNovel 落库链
- [x] 4.3 调用点核对：EmotionArcPanel、NovelCharacterGraph 面板存取改道到 Novel 字段；存储键常量（全名 `endless-creation.novel-emotion-arcs` / `endless-creation.novel-character-graphs`）仅迁移探测/清理时读删，正常写路径不再使用

## 5. 验证

- [x] 5.1 `npm run build` 双端（renderer vite + electron tsc）通过
- [x] 5.2 文本完整性扫描通过（`C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py`）；改动文件 U+FFFD 幻影字节 clean
- [x] 5.3 `git diff --check` 干净
- [x] 5.4 运行时/真机核验：新分析写 Novel 字段不写 localStorage；老 localStorage 数据加载即迁移进字段（字段 undefined 触发）；saveNovel 成功后删条目、失败保留；合法空成果不被覆盖；崩溃残留条目被清理；坏数据不阻断加载/不删/不写；导出 novel.json 含两字段；v4/v5 迁移不丢数据
