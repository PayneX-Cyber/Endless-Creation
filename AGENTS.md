# Endless Creation Agent Rules

## Delivery Granularity

- Default to end-to-end feature packages, not tiny "next knife" tasks.
- Do not split implementation into design-only / protocol-only / UI-only / QA-only slices unless the user explicitly asks.
- When a roadmap phase has multiple small adjacent UX items, implement and validate them together if they touch the same area.
- Keep commits coherent, but do not slow development by turning every sub-step into a separate dispatch or handoff.
- Ask for a scope decision only when options are genuinely mutually exclusive or risky; otherwise pick the shortest safe path and execute.
- Do not end a turn by asking whether to "fill the remaining pieces" of an already-chosen package; finish the package unless blocked.
- 中文口径：不要再把项目开发拆得过细；路线已定时默认一次跑完整包，不要反复用“下一刀/要不要补齐/由你定”拖慢节奏。

## Validation

- For code changes, run `npm.cmd run build` when feasible.
- For UI text changes, run:
  `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"`
