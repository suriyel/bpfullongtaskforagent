---
name: wd
description: "Worker 阶段 A — 为当前特性产出详细设计文档（接口契约 / 实现摘要 / 算法伪码 / 图表 / 测试清单），通过分发 feature-design SubAgent 完成；完成后由 loop 引擎自动推进"
---

**语言规则**：用中文（简体）回复用户。所有生成的文档、报告和面向用户的输出用中文。Skill 名称、代码标识符、JSON 字段名保持英文。

# Worker — 阶段 A：Feature Design

每次 loop 迭代处理**一个特性**的详细设计产出。完成后由蓝图 loop 引擎自动推进到下一节点（red）。

**开始时宣告：** "I'm using the wd skill. Let me orient myself."

**核心原则：** Feature Design 子步骤在**独立 SubAgent**中运行（`long-task-feature-design`）。主 Agent 仅负责分发并消费 **Structured Return Contract** —— 契约与 DISPATCH 语法参见 `{{SHARE-REFERENCE}}/structured-return-contract.md`（若存在；否则使用本文末 § Structured Return Contract 内嵌定义）；SubAgent 返回按 `{{SHARE-REFERENCE}}/approval-revise-loop.md` 处理。

**一致性重读（允许重复读，一致性优先）：** 启动时做 5 件事：
1. 读 `{{TASK_GET}}` → 取 `task.id` / `task.title` / `task.srs_trace` / `task.ui` / `task.category` / 其他业务字段
2. 读 `{{HARNESS_MEMORY_DIR}}/plans/srs.md` 对应 `task.srs_trace` 的 FR/NFR 节
3. 读 `{{HARNESS_MEMORY_DIR}}/plans/design.md` 对应 `§2.N` 子节
4. 读 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §4`（存量代码库约束，如存在）
5. 读 `{{HARNESS_MEMORY_DIR}}/plans/ucd.md`（仅 ui:true）/ `{{HARNESS_MEMORY_DIR}}/plans/ats.md`（若存在）

**静默执行协议：** 每一次构建、测试、检查命令都重定向到 `/tmp/<slug>-$$.log` + exit 文件。永不向主 agent 倾倒完整输出。

## Checklist

### 0. env-guide 审批关卡

检查 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` 是否已批准（含 `**状态**: 已批准` 元数据行或类似）。Exit 0 继续；Exit 1 阻塞并 AskUserQuestion 升级；若无 env-guide.md（pre-init / CLI-only）则跳过。

### 1. Orient —— 读当前任务并定位文档章节

- 调 `{{TASK_GET}}` 读当前任务（loop 引擎已挑好；不要自行选 feature）
- `target_feature` = 任务对象本身
- 读 `{{HARNESS_MEMORY_DIR}}/plans/design.md` § 架构（§1）+ `target_feature` 对应的 `§2.N` 子节（按"文档查询协议"通过 Read offset/limit 定位）
- 读 `{{HARNESS_MEMORY_DIR}}/plans/srs.md` 中 `target_feature.srs_trace` 指向的所有 FR-xxx 子节
- 读 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §4`（如存在）
- 若 `target_feature.ui == true` 且 `{{HARNESS_MEMORY_DIR}}/plans/ucd.md` 存在：读 UCD 样式指南相关章节
- `git log --oneline -10` 取最近 commit 上下文
- 在 `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md` 当前特性标题下记录：target_feature.id / title / design_section 行号 / srs_section 行号

### 2. Bootstrap
- 按 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §2` 激活项目环境（如存在）
- 若 `init.sh` / `init.ps1` 存在且环境未就绪：运行一次
- **Feature Design 阶段不需要启动业务服务** —— 服务就绪性由 TDD 阶段（red/green）关心

### 3. Config Gate（条件性）

仅当 `target_feature.required_configs[]` 含连接串键（URL / URI / DSN / CONNECTION / HOST / PORT / ENDPOINT）时执行；否则跳过。

校验所需 config 是否齐全（读 `.env` 或项目 config 文件，或当前任务 `required_configs[]` 字段）。
缺失 config 处理：用 AskUserQuestion 文本输入收集缺失值 → 写入 `.env` 或项目 config 文件 → 重新校验，直至通过。设计阶段仍需 config 存在性校验，以便 Feature Design SubAgent 能够准确描述外部接口。

### 4. DISPATCH Feature Design SubAgent

> **DISPATCH** → 创建独立 SubAgent（使用 Agent 工具），在 subagent 中加载并执行 skill `long-task:long-task-feature-design`
> **input**: `feature_id`（取自 `{{TASK_GET}}`）, `target_feature`（完整任务对象，含 srs_trace / tech_stack / ui / category / required_configs 等业务字段）, `design_section=<行号起止>`, `srs_section=<FR-xxx 行号起止>`, `ucd_section=<仅 ui:true>`, `working_dir`
> **expect**: Structured Return Contract；`next_step_input.feature_design_doc` 必须存在（SubAgent 写入路径为 `{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md`，slug 规则统一由蓝图约定）

> **对 `category: "bugfix"`**：feature-design 精简，聚焦根因记录 + 定向修复 + 回归测试清单。

SubAgent 执行规则与产物模板由 SubAgent 自行加载：
- 执行规则：`reference/feature-design-execution.md`
- 产物模板：`reference/feature-design-template.md`

**返回处理**（按 `{{SHARE-REFERENCE}}/approval-revise-loop.md`）：

- `status: blocked` → 按 blockers[] 前缀（`[SRS-VAGUE]` / `[SRS-DESIGN-CONFLICT]` / `[ATS-MISMATCH]` / `[ATS-BUGFIX-REGRESSION-MISSING]` / `[UCD-VAGUE]` / `[DEP-AMBIGUOUS]` / `[NFR-GAP]` / `[CONTRACT-DEVIATION]`）组装 AskUserQuestion；收集裁决后以 Clarification Addendum 重分发（不计入 revise 上限）
- `status: fail` → Failure Addendum 重分发（计入 revise 上限 2 轮）
- `status: pass` 且 `next_step_input.assumption_count > 0` → 审批关卡（approve / revise / skip-feature / escalate）让用户确认 assumptions
- `status: pass` 且 `assumption_count == 0` → 进入 Step 5
- 同一前缀 3 次 blocked → 自动 escalate
- 用户选 C（打回 SRS 侧）→ task-progress.md 记录缺口 + 建议 `long-task-increment`，本特性 `bp-advance blocked --notes='[REQ-INCREMENT-NEEDED]'`（loop 引擎按 onFail 处理）

### 5. Persist

**5a. 更新 task-progress.md**：在 `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md` 当前特性标题下追加（路径以 SubAgent 返回的 `next_step_input.feature_design_doc` 为准）：
```
- Design: DONE (<feature_design_doc>)
```

**5b. 校验**：手动确认 SubAgent 返回的 `next_step_input.feature_design_doc` 路径存在；含 §4 / §6 / §7 / §8 / §11 等必填章节；测试清单负向比例 ≥ 40%；ATS 必须类别覆盖。

**5c. 上报引擎**：`{{ADVANCE_OK artifact={{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md}}` —— loop 引擎自动推进到 red 节点。

## 关键规则

- **本节点只产出设计文档** —— 不做 TDD 也不做 ST
- **SubAgent 不可协商** —— `long-task-feature-design` 必须通过 Agent 工具分发
- **用户裁决一律由主 agent 按 loop.md 组装** —— sub-skill 绝不发 AskUserQuestion
- **本节点完成前必须确认 feature_design_doc 文件存在** —— 字段缺失 → 视为 fail
- **SRS/Design/UCD 模糊不得假设** —— 返 blocked 走 Clarification Addendum

## 红旗信号

| 逃避 | 正确动作 |
|---|---|
| "我顺便把 TDD 也做了" | 终止本节点。TDD 是下一节点 red 的工作。|
| "SRS 模糊但我就假设……" | SubAgent 返 `[SRS-VAGUE]` → Clarification Addendum |
| "这个特性简单，skip Feature Design 直接做 TDD" | Feature Design 不可绕过。每特性都要。|
| "忘了校验 feature_design_doc 字段" | 校验后再上报 ok。|

## 阻塞 / 失败

- SubAgent 返回 `[SRS-VAGUE]` / `[SRS-DESIGN-CONFLICT]` / `[ATS-MISMATCH]` 等结构化 blocker → 主 agent 按前缀表组装 AskUserQuestion → Clarification Addendum 重分发
- 同一前缀 3 次仍 blocked → `bp-advance blocked --notes='<前缀>'` 上报引擎，由 onFail 决定回卷
- SubAgent 多次 fail（超 revise 上限）→ `bp-advance failed` 上报引擎
- 用户选择"打回 SRS 侧"（需要 increment）→ `bp-advance blocked --notes='[REQ-INCREMENT-NEEDED]'`
