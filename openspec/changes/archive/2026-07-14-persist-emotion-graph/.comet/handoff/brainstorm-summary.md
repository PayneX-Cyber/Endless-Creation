# Brainstorm Summary

- Change: persist-emotion-graph
- Date: 2026-07-13

## 确认的技术方案

将情感曲线与人物图谱提升为 Novel v6 的可选字段，Novel 成为唯一权威源。主进程只负责 schema 消毒；renderer 在单本小说加载时惰性迁移旧 localStorage 数据。字段仅在缺失（undefined）时迁入；合法空成果不覆盖。迁移先校验、再保存，saveNovel 成功后才删除当前 novelId 的旧条目。

## 关键取舍与风险

- 不迁伏笔 AI 候选：它是可再生成的会话态，接受后已进入正式伏笔。
- 不改导出实现：离线包的 novel.json 已直接序列化 Novel。
- 损坏旧条目优先保留：解析或结构校验失败时不写、不删、不阻断小说加载。
- 崩溃窗口可重入：字段已有且旧条目仍可解析时，仅清理残留，不覆盖 Novel。
- normal write path 完全下线 localStorage，避免双写与权威源漂移。

## 测试策略

- 纯逻辑自检覆盖字段缺失、合法空成果、坏数据、字段已有不覆盖。
- 运行时验证覆盖保存成功后清理、保存失败保留、同键其他小说不受影响。
- 双端 build、文本完整性扫描、diff-check。
- GUI 真机覆盖迁移后显示、重新分析/推演、重开保留及离线包 novel.json。

## Spec Patch

已回写 delta spec：明确 EmotionArc 合法空成果仍含 updatedAt；所有删除前必须先解析校验，坏数据保留优先于残留清理。
