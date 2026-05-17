---
name: init-features
description: "Use when dispatched by init Step 5 — generate long-task-guide.md + populate loop items array at .harness/blueprint/tasks/iter.json (constraints/assumptions/features/required_configs) + .env.example + check_configs.py + inline validate"
---

# 生成 Worker 指南与特性清单

一次性产出 Worker 会话所需的全部协调性工件：workflow 导航指南 + 完整的 iter loop items 数组（写入引擎即弃路径）+ 配置检查器 + 校验。主 agent 持有 sizing 关卡。

**数据流**：本 SubAgent 输出的 items JSON 写入引擎约定即弃路径 `.harness/blueprint/tasks/iter.json`；主 agent 后续 `{{TASKS_SET loop=iter}}` 灌入 loop 后引擎自动 unlink。下游节点（wd/red/green/refactor/wst 等）通过 `{{TASKS_GET}}`（全量）/ `{{TASK_GET}}`（当前 task）占位符访问，**不再依赖 feature-list.json 或 iter-tasks.json 这类持久化文件**。

## 步骤

### A. 生成 `long-task-guide.md`

1. 由 init 主 SKILL.md §5 dispatch input 提供 worker 阶段说明（wd/red/green/refactor/wst 节点的概要 + Real Test Convention + UI 测试节）；SubAgent 不跨 skill 边界读其他节点 SKILL.md
2. 通过 `{{TASKS_GET}}`（拿全量 tasks 数组，每 task 的 tech_stack 字段一致）确认语言与测试框架；init 阶段灌入前若 `{{TASKS_GET}}` 返回空，则降级读 `{{HARNESS_MEMORY_DIR}}/plans/project-context.md` 的 tech_stack
3. 读 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md`（已存在）确认 §1/§3 指引路径
4. 写 `{{HARNESS_MEMORY_DIR}}/notes/long-task-guide.md`：**仅工作流导航**，不嵌具体命令
   - 必需节：Orient、Bootstrap、Config Gate、TDD Red、TDD Green、Coverage Gate、TDD Refactor、Verification Enforcement、Inline Compliance Check、Persist、Critical Rules
   - 命令引用一律写 "See `env-guide.md` §3 Build & Execution Commands" / "See `env-guide.md` §1 Service Lifecycle"
   - `Config Management` 节：描述本项目 config 格式（dotenv / Spring properties / 系统 env）下如何新增/更新值
   - `Real Test Convention` 节：识别方法（marker / folder / naming，适配语言）、指引到 env-guide.md §3 对应仅运行真实测试的命令、本技术栈下真实测试示例
   - 仅当项目有 UI 特性时包含 UI 测试节（Chrome DevTools MCP 工具名）
5. Inline 自检（蓝图无 validate 脚本）：确认必需节齐全（11 节），节标题精确匹配；任一缺失 → `status: fail`，evidence 列出缺失节名

### B. 填充 items 数组的 SRS 字段

输出形态：items 数组（JSON 数组），每元素 task 含 srs_trace/title/description/priority/dependencies/status/category/tech_stack/constraints/assumptions/single_round/ui 等字段（对齐 blueprint.json.tasksSchemas.default）。各项目级元数据（`constraints` / `assumptions` 数组、`single_round` 标记）作为每个 task 的字段透传，**不在 task 数组之外另存全局根字段**。

1. 读 `{{HARNESS_MEMORY_DIR}}/plans/srs.md`
2. 每 task 的 `constraints[]` ← SRS "Constraints" 节 CON-xxx 条目（每条一字符串）
3. 每 task 的 `assumptions[]` ← SRS "Assumptions & Dependencies" 节 ASM-xxx 条目
4. NFR-xxx 行 → 追加到 items[]，`category: "non-functional"`，`srs_trace: ["NFR-xxx"]`，可选可度量 `verification_steps`；覆盖率关卡不适用于 NFR 特性
5. SRS frontmatter 含 `Single-Round: Yes` → 每个 task 的 `single_round: true`

### C. 从 Design §6.1 填充核心特性

1. 读 `{{HARNESS_MEMORY_DIR}}/plans/design.md` §6.1 任务分解表 + §6.2 依赖链
2. 读 `{{HARNESS_MEMORY_DIR}}/plans/ats.md`（若存在）用于 srs_trace → 类别映射查询
3. 每 §6.1 行 → 一特性：
   - `srs_trace` ← "Mapped FRs" 列
   - `title` + `description` ← 特性名 + 被分组 FR 描述
   - `priority` ← P0/P1 → `high`，P2 → `medium`，P3 → `low`
   - `dependencies` ← §6.2 依赖链图
   - `status` 始终 `"failing"`（推进到 passing 由 loop 引擎根据 `tasksSchemas.default.doneValues=["passing"]` + wst 节点 `bp-advance ok` 自动翻转）
   - UI 特性（srs_trace 任一 FR 的 ATS 类别含 UI）→ `ui: true` + `ui_entry: "/path"`；至少 1 条带 `[devtools]` 前缀的 verification_step 断言**正面视觉存在**
   - 前端特性 `dependencies[]` 必须列出后端 API 依赖特性
   - 排序遵循 §6.1 行顺序（Design 已按优先级 + backend/frontend 配对）
4. **当前任务由 loop 引擎 selectStrategy=first-pending 自动挑选**（蓝图 iterator 配置），SubAgent 无需处理 `current` 字段
5. **校验关卡**（内部）：
   - 每 FR-xxx 必须至少出现在一个特性的 srs_trace（无孤立需求）→ 否则 `blocked`，blockers `["ats-srs-trace-orphan: FR-xxx"]`
   - 每特性 srs_trace 非空 → 否则 `blocked`

### D. LOC 估算与 sizing 带分类

公式（透明可复核）：
```
est_loc = (sum of AC counts × 80) + (interface-contract method count × 100) + (test-inventory estimated rows × 30)
```
- AC 数来自 SRS srs_trace 需求
- method / test 数在本阶段为估值（Design §4 作参考）

分类：
- `< 500` → small
- `500-1500` → ok
- `> 1500` → large
- `single_round: true` 模式下上限放宽到约 2000

**不在 sub-skill 内做合并/拆分决策**：仅计算并落盘本次草稿，将分布 + 每特性估值通过 `next_step_input.loc_distribution` + `feature_summary` 返回，由主 agent 持 sizing 关卡。

### E. `required_configs` + `.env.example` + 项目根 `check_configs.py`

1. 读 SRS IFR-xxx 接口需求 + Design：
   - API key / 服务 URL → type `env`
   - 配置文件 / 证书 → type `file`
   - 每条 `required_by` 关联到相应特性 ID 数组
   - `check_hint` 给出设置说明
   - 将 required_configs 信息**作为每个相关 task 的 `required_configs` 字段**写入 items 数组（task 级，非项目级根字段）
2. 写项目根 `.env.example`（项目级配置文件，不入 harness memory）：每 env 类型 config 一块注释模板
   ```
   # <name> — <description>
   # Hint: <check_hint>
   # Required by features: <required_by ids>
   <KEY>=
   ```
3. 把 `.env` 加入项目根 `.gitignore`；`.env.example` 本身可安全提交
4. 生成项目根 `check_configs.py`（项目级辅助脚本，由 wd / red / green 等节点 Bash 直调）：
   - 基于 tech_stack（从 `{{TASKS_GET}}` 任一 task 的 tech_stack 字段拿）与设计文档选加载方式（dotenv / Spring properties / YAML / 系统 env）
   - 标准接口：`python check_configs.py --feature <id>`，从 `bp-context tasks` 拿 required_configs 字段（或 SubAgent 把 items 内联编入脚本字典）
   - `env` 类型查 `os.environ`，`file` 类型查 `os.path.exists`
   - 打印缺失的 `name` + `check_hint`
   - Exit 0 所有必需存在；Exit 1 缺失任一
   - **不要** `--dotenv` / format 标志；加载逻辑硬编码

### F. 落盘 items 数组到引擎即弃路径 + 自检

1. 把 items JSON 数组写入 `.harness/blueprint/tasks/iter.json`（蓝图引擎约定即弃路径；主 agent 后续 `{{TASKS_SET loop=iter}}` 灌入后由 server 端 fs.unlinkSync 自动清理）
2. Inline 自检（蓝图无 validate 脚本）：
   - 每 FR-xxx 至少出现在一个 task 的 srs_trace；任一孤立 → `blocked`，blockers `["srs-trace-orphan: FR-xxx"]`（逐条）
   - 每 task 的 id 唯一、status="failing"、srs_trace 非空
   - long-task-guide.md 必需 11 节齐全
   - 任一失败 → `status: fail`，evidence 附缺失项

## 返回

```markdown
## SubAgent Result: init-features

**status**: pass | fail | blocked
**artifacts_written**: [
  "{{HARNESS_MEMORY_DIR}}/notes/long-task-guide.md",
  ".harness/blueprint/tasks/iter.json",
  ".env.example",
  ".gitignore",
  "check_configs.py"
]
**next_step_input**: {
  "feature_count": 15,
  "loc_distribution": {"small": 2, "ok": 11, "large": 2},
  "feature_summary": [
    {"id": 1, "title": "Login API", "est_loc": 1100, "band": "ok", "ui": false, "srs_trace": ["FR-001", "FR-002"]}
  ],
  "ui_feature_count": 3,
  "config_count": 5,
  "nfr_feature_count": 2,
  "single_round": false,
  "inline_check_passed": true
}
**blockers**: []
**evidence**: [
  "long-task-guide.md: all 11 required sections present",
  "iter.json: 15 task items; all FR-xxx covered; no srs_trace orphans",
  "inline check: schema fields complete; ids unique; status=failing",
  "check_configs.py generated for python/dotenv loader"
]
```

## 阻塞 / 失败

- `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` 不存在（features 依赖其 §3 引用）→ `blocked`，blockers `["env-guide-not-found"]`
- Design §6.1 缺失或为空 → `blocked`，blockers `["design-§6.1-missing"]`
- 任一 SRS FR-xxx 未被任何 task 的 srs_trace 覆盖 → `blocked`，blockers `["srs-trace-orphan: FR-XXX"]`（逐条列出）
- inline 自检任一规则失败 → `status: fail`，evidence 附缺失项

## 反模式

| Anti-Pattern | Correct |
|---|---|
| 在 sub-skill 内做合并/拆分决策 | 只计算分布返回；主 agent 持 sizing 关卡 |
| 在 long-task-guide.md 嵌具体 build/test 命令 | 一律引用 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §3；防双源漂移 |
| 跳过 srs_trace 孤立检查 | 孤立 FR 必须阻塞，不能静默通过 |
| 忘记把 `.env` 加入 `.gitignore` | 密钥泄露风险；`.env.example` 可提交，`.env` 必须忽略 |
| 把插件的 `check_configs.py` 原样复制 | 必须按项目技术栈**重新生成**，加载逻辑硬编码 |
| 写 `feature-list.json` / `iter-tasks.json` 等持久化文件 | items 数组只写引擎即弃路径 `.harness/blueprint/tasks/iter.json`；下游用 `{{TASKS_GET}}` 占位符读 |
| 前端特性不列后端 API 依赖 | 前端 `ui: true` 特性的 `dependencies[]` 必须包含其 API 后端特性 |
| 用旧硬编码 10-200 数量区间判定 sizing | 按 `context_budget_tokens` 动态算 upper_bound；小项目允许 < 10 特性 |
