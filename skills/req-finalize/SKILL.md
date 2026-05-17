---
name: req-finalize
description: "Use when dispatched by req Step 15 — save SRS to {{HARNESS_MEMORY_DIR}}/plans/, save deferred backlog if present (蓝图模式下不入 git——产物归 harness memory 管理)"
---

# SRS 落盘

## 步骤

### A. 读模板

从 prompt 中的 `srs_template_path` 读 SRS 模板。校验：`.md` 文件且至少含一个 `## ` 标题。

### B. 填充章节

对模板中每个 `## ` / `### ` 标题：
- `approved_srs_sections` 中存在对应 key → 用其 markdown 内容替换标题下的指引文字（保留标题本身）
- 不存在 → 在该标题下写 `[Not applicable]`

对 `approved_srs_sections` 中**无匹配标题**的 key → 追加到文末 `## Additional Notes` 段。

### C. 写 frontmatter

在文件顶部（在首个 `# ` 标题之前）写入：

```
Date: YYYY-MM-DD
Status: Approved
Standard: ISO/IEC/IEEE 29148
Template: <srs_template_path>
```

按条件追加：
- `single_round_flag == true` → 追加一行 `Single-Round: Yes`
- `alignment_summary_text` 非空 → 将其写入 §1.3 的 "Alignment Validation" 字段位置（若章节已有占位，替换；否则在 §1.3 末尾追加）

### D. 保存 SRS

`{{HARNESS_MEMORY_DIR}}/plans/<today_iso_date>-<topic_name>-srs.md`。

**路径冲突**：文件已存在 → `status: blocked`，blockers 附既有文件路径，要求主 agent 决定覆盖 / 改 topic / 中止。

### E. 保存 deferred backlog

若 `deferred_items` 非空：
- 保存 `{{HARNESS_MEMORY_DIR}}/plans/<today_iso_date>-<topic_name>-deferred.md`
- 每条保留原 EARS + AC 字段；顶部写 `Source: <srs_path>` + `Date: YYYY-MM-DD`

若 `deferred_items` 为空，跳过本步。

### F. 完成

蓝图模式下产物落 `.harness/memory/plans/`，归 harness memory 管理，**不入用户项目 git**。SRS approved 事件由蓝图引擎 `.harness/blueprint/runs/<runId>.jsonl` 自动记录，无需 sub-skill 显式 commit。直接组装返回契约即可（见下方"返回"段）。

## 返回

```markdown
## SubAgent Result: req-finalize

**status**: pass | fail | blocked
**artifacts_written**: ["{{HARNESS_MEMORY_DIR}}/plans/2026-04-17-todo-cli-srs.md", "{{HARNESS_MEMORY_DIR}}/plans/2026-04-17-todo-cli-deferred.md"]
**next_step_input**: {
  "srs_path": "{{HARNESS_MEMORY_DIR}}/plans/2026-04-17-todo-cli-srs.md",
  "deferred_path": "{{HARNESS_MEMORY_DIR}}/plans/2026-04-17-todo-cli-deferred.md",
  "topic": "todo-cli"
}
**blockers**: []
**evidence**: [
  "Template coverage: 14 of 15 sections filled (1 [Not applicable])",
  "SRS: 342 lines; deferred: 18 lines",
  "frontmatter: Date / Status=Approved / Standard / Template all present"
]
```

## 阻塞 / 失败

- `approved_srs_sections` 为空 或缺 §1 / §4 核心章节 → `fail`
- `srs_template_path` 无法读取 / 非 `.md` / 无 `## ` 标题 → `fail`
- `topic_name` 含非法字符（非 `[a-z0-9-]`）→ `fail`
- 目标 SRS 路径已存在 → `blocked`，blockers 附既有路径

## 反模式

| Anti-Pattern | Correct |
|---|---|
| 触发下一 skill（ucd）| 不触发；仅返回 next_step_input，由蓝图 DAG 自动推进到 gate_srs / ucd |
| `approved_srs_sections` 之外新增内容 | 只落盘主 agent 审批过的内容；不自作主张补章节 |
| deferred 文件只写 title | 保留完整 EARS + AC，供 increment 捡起 |
| 未 frontmatter 即保存 | 必须含 Date / Status / Standard / Template 四项 |
| 显式 git add / git commit | 蓝图模式产物归 harness memory（`.harness/memory/plans/`），不入用户项目 git；事件审计由 `.harness/blueprint/runs/<runId>.jsonl` 承担 |
