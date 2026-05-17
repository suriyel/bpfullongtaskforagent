---
name: init
description: "当 ATS 文档存在（或自动跳过）但 features 任务清单未生成时使用 — 打包项目骨架、分发三个 sub-skill 生成 env-guide.md / init.sh / long-task-guide.md + features，然后 git init 并灌入 iter loop"
---

**语言规则**：用中文（简体）回复用户。所有生成的文档、报告和面向用户的输出必须用中文编写。Skill 名称、代码标识符和 JSON 字段名保持英文。

# 初始化 Long-Task 项目

在 SRS / Design / ATS 都获批后运行一次。通过 `init_project.cjs` 打包确定性骨架，分发三个 sub-skill 生成 env-guide.md / init.sh / long-task-guide.md + features，然后 git init 并把 features 灌入 iter loop。Step 3/4/5 分发到 SubAgent；主 agent 仅保留 orchestration + 用户交互。

## 输入文档

| 文档 | 位置 | 提供 |
|----------|----------|----------|
| **SRS** | `{{HARNESS_MEMORY_DIR}}/plans/srs.md` | FR / NFR / CON / ASM / IFR / 术语表 / 角色 / 验收标准 |
| **Design** | `{{HARNESS_MEMORY_DIR}}/plans/design.md` | 技术栈、架构、数据模型、API 设计、§6.1 任务分解、§6.2 依赖链 |
| **UCD**（如有 UI）| `{{HARNESS_MEMORY_DIR}}/plans/ucd.md` | 色板 / 字体 / 间距 token、组件级 prompt、页面级 prompt — 仅在 ucd 节点产出该文件时存在 |
| **ATS** | `{{HARNESS_MEMORY_DIR}}/plans/ats.md`（可选，≤5 FR 时可缺失）| 需求→场景映射、每条需求所需测试类别（通过 srs_trace 约束 `ui` 标记与下游 feature-st 类别要求）|
| **用户原始诉求** | `{{HARNESS_MEMORY_DIR}}/intent/user-original-intent.md` | 蓝图启动时用户原话（scan 节点固化）；用于背景对齐与 task[] 元数据校验，**不**作为决策依据 |

主 agent 仅读路径定位文件，**不读全文**；各 sub-skill 在独立 SubAgent 上下文中自行加载所需章节。

## 共享资产

- **返回契约**：`{{SHARE-REFERENCE}}/structured-return-contract.md`（若存在；否则按节点末嵌入约定）
- **审批-返工循环**：`{{SHARE-REFERENCE}}/approval-revise-loop.md`（approve / revise / escalate；2 轮封顶；sizing 关卡与 env §3/§4 双闸门规则；Addendum 组装）

## 流程概览

下列步骤按顺序完成：

### 1. Orient

- 定位 `{{HARNESS_MEMORY_DIR}}/plans/{srs,design,ats,ucd}.md` 路径
- SRS 中读取项目名（供 Step 2 `--project-name`）与语言提示（供 Step 2 `--lang`）
- `git log --oneline -10`（若已有 git 历史）

### 2. 运行 `{{SCRIPTS}}/init_project.cjs`

```bash
node {{SCRIPTS}}/init_project.cjs "<project-name>" \
  --memory-dir={{HARNESS_MEMORY_DIR}} \
  --lang=<python|java|typescript|c|cpp> \
  --test-framework=<...> --coverage-tool=<...>
```
- `<project-name>` 来自 SRS 标题
- `<language>` 来自 Design §1.4 技术栈
- 可选 `--line-cov` / `--branch-cov` 覆盖默认阈值（90 / 80）

本步产出：`{{HARNESS_MEMORY_DIR}}/plans/project-context.md`（含 tech_stack / quality_gates / constraints / assumptions）+ `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md` + `RELEASE_NOTES.md` + `examples/`（保留在 cwd 根作发布产物）。

### 3. 生成 env-guide.md

> **DISPATCH** → 创建独立 SubAgent（{{AGENT}}），在 subagent 中加载并执行 skill `init-env`
> **input**: `project_lang`（来自 init_project.cjs 写入的 project-context.md tech_stack）
> **expect**: Structured Return Contract；`artifacts_written=["{{HARNESS_MEMORY_DIR}}/notes/env-guide.md"]`；`next_step_input` 含 `services[]` / `env_activation_cmd` / `build_cmd` / `test_cmd` / `coverage_cmd` / `tool_version_pins` / `ui_detected`

按 `{{SHARE-REFERENCE}}/approval-revise-loop.md` 处理。**§3 与 §4 合并在同一关卡审批**——approve 时主 agent 更新 env-guide.md frontmatter `approved_by` / `approved_date` / `approved_sections: ["§3", "§4"]`。

### 4. 生成 init.sh / init.ps1

> **DISPATCH** → 创建独立 SubAgent（{{AGENT}}），在 subagent 中加载并执行 skill `init-bootstrap`
> **input**: （从 project-context.md.tech_stack + env-guide.md §2 / §3 自行定位）
> **expect**: Structured Return Contract；`artifacts_written=["init.sh", "init.ps1"]`；`next_step_input` 含 `env_manager` / `runtime_version` / `install_commands`；`evidence` 必含 `"bash -n clean"` 与 PowerShell parser 通过记录

零审批直通：确定性输出 + 内置语法自检。`status: pass` 即跳到下一步。`fail` / `blocked` 按 loop 模板处理。

### 5. 生成 long-task-guide.md 与 features 任务清单（**需求拆分按蓝图 tasksSchemas 规则**）

**关键约束 — 任务字段必须严格遵循蓝图 `tasksSchemas.default` 规约**（见本节点末"Tasks Schema"段；该段已固化在本 SKILL.md，与 `blueprint.json.tasksSchemas.default` 同源——如修改字段定义请两处同步）。SubAgent 不得自定义任务字段；蓝图引擎对 `id` / `status` 字段强校验，对 `doneValues=["passing"]` 之外的字段透传。

> **DISPATCH** → 创建独立 SubAgent（{{AGENT}}），在 subagent 中加载并执行 skill `init-features`
> **input**:
> - 文档路径：从 SRS / Design / ATS / env-guide.md / project-context.md.tech_stack 自行定位
> - **任务结构规约（强制）**：必须按蓝图 `tasksSchemas.default` 产出每个 item，字段列表与类型对照本节点末 Tasks Schema 段：
>   - **L1 必填**：`id`（string|number，全局唯一）、`status`（string，初始化为 `"failing"`，loop 引擎按 `doneValues=["passing"]` 判定完成）、`dependencies`（array，可空）
>   - **L2 推荐**：`title`（string）、`description`（string）、`priority`（high|medium|low）
>   - **L3 业务字段**：`category`（string，如 `core`/`bugfix`/`infra`）、`srs_trace`（array，FR/NFR ID 列表）、`verification_steps`（array，Given/When/Then 行）、`tech_stack`（object，从 project-context.md.tech_stack 继承）、`constraints`（array，复制 SRS CON 项）、`assumptions`（array，复制 SRS ASM 项）、`single_round`（boolean）、`ui`（boolean，UI 特性标识）
>   - 未声明字段允许透传（`extensionFieldsAllowed=true`），下游 body skill 可用 `{{loop.task.<field>}}` 引用
> - **粒度约束**：每个 task 目标实现约 1000 行代码 + 测试（对应单 Worker 会话约 50% 上下文）；loop `maxIterations=50`，建议 task 总数 ≤ 30 以预留 onFail 回卷空间
> **expect**: Structured Return Contract；`artifacts_written` 含 `{{HARNESS_MEMORY_DIR}}/notes/long-task-guide.md` / `{{HARNESS_MEMORY_DIR}}/plans/iter-tasks.json` / `.env.example` / `.gitignore`；`iter-tasks.json` **必须是符合 `tasksSchemas.default` 的 items 数组**（JSON 数组顶层 = task 列表，非源项目的"根对象含 features 字段"嵌套结构）；`next_step_input` 含 `feature_count` / `loc_distribution` / `feature_summary` / `ui_feature_count` / `config_count`

按 `{{SHARE-REFERENCE}}/approval-revise-loop.md` 处理。审批关卡**前**先走 **sizing 关卡**（见 loop 模板"Features Sizing 关卡细则"）：
- `y` → approve 通过
- `auto-fix` → Addendum "按 loc_distribution 中 small/large 特性执行合并/拆分；保持 srs_trace；维持 tasksSchemas.default 字段合法" 重分发
- `manual-adjust` → 暂停让用户编辑 `{{HARNESS_MEMORY_DIR}}/plans/iter-tasks.json`；resume 后主 agent 重跑字段合法性校验（id 唯一性 / status 默认值 / required/recommended 字段齐全 / enum 合法）

### 6. 脚手架项目骨架

基于设计文档架构创建源码目录（如 `src/`、`tests/`、语言特定子目录）。本步不创建业务代码——仅空目录 + `.gitkeep` 或 README 占位。

### 7. Git init 与初始提交

```bash
git init
git add -A
git commit -m "chore: initialize long-task project scaffold

- iter-tasks.json with N features
- env-guide.md, long-task-guide.md
- init.sh / init.ps1 bootstrap scripts
- .env.example
"
```

### 8. 运行 init 脚本并校验环境

- 运行 `bash init.sh`（Unix）或 `pwsh ./init.ps1`（Windows），确认环境安装无错误
- 激活环境后执行 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §3 定义的测试命令，确认可执行（此时特性全部 failing 是预期的）
- 任何失败 → 诊断根因，修 `init.sh` / `init.ps1` / `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md`，重跑
- **不要**在此启动服务——服务在 Worker / ST 阶段按 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §1 启动

### 9. 更新 task-progress.md

- 在 `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md` 追加 `## Session 0 — Init` 条目：SRS / Design / ATS 路径引用、特性总数、UI 特性数、config 数
- **不**写 `## Current State` 进度条——当前状态由蓝图 loop 引擎 state 管理

### 10. 灌入 iter loop（必须执行，否则 run 卡死）

**漏调后果**：下游 `iter` loop 入口检测 `state.loops.iter.tasks` 为空 → halt（reason: `loop_no_tasks_seeded`）。

**步骤**：
1. 根据 `{{HARNESS_MEMORY_DIR}}/plans/iter-tasks.json` 中 init-features 子 skill 已生成的 items 数组（每条 task 的 id 必须唯一）
2. **在 `bp-advance` 之前**执行：

{{TASKS_SET loop=iter}}

> 未声明字段透传，body skill 可用 `{{loop.task.<field>}}` 引用。

<!-- tasks-schema: default -->
## Tasks Schema（iter-tasks.json items[] 元素结构）

以下字段表与示例**直接固化在本 SKILL.md**，与 `blueprint.json.tasksSchemas.default` 同源。Step 5 init-features SubAgent **必须**按此 schema 产出 `iter-tasks.json`；蓝图引擎对 L1 字段做强校验，L2/L3/L4 字段透传。

> ⚠ 修改字段定义时**两处同步**：本 SKILL.md 与 `blueprint.json.tasksSchemas.default`（运行时引擎用它做 items 校验）。

### items[] 元素结构

```json
[
  {
    "id": 1,                                   // L1 必填: string|number; 全局唯一（建议数字 1,2,3...）
    "status": "failing",                       // L1 必填: string; default "failing"; 由 loop 引擎按 doneValues=["passing"] 判定完成；任务完成由 wst 节点 bp-advance ok 自动翻转
    "title": "登录表单组件",                    // L2 推荐: string
    "description": "邮箱 + 密码字段、必填校验、submit 触发回调", // L2 推荐: string
    "priority": "high",                        // L2 推荐: string ∈ ["high", "medium", "low"]
    "dependencies": [],                        // L2 推荐: array<id>; 仅引用本批次已存在 id，不得跨 loop 迭代引用
    "category": "core",                        // L3 业务: string (e.g. "core" / "bugfix" / "infra")
    "srs_trace": ["FR-001", "FR-003"],         // L3 业务: array<string> FR/NFR ID 列表；每个 FR-xxx/NFR-xxx 至少出现在一个 task 的 srs_trace 中
    "verification_steps": [                    // L3 业务: array<string> Given/When/Then 行为场景；至少 1 步含 3+ 链式操作
      "页面渲染表单",
      "空提交报错",
      "成功 submit 调回调"
    ],
    "tech_stack": {},                          // L3 业务: object; 继承 project-context.md.tech_stack
    "constraints": [],                         // L3 业务: array<string>; 复制 SRS CON 项
    "assumptions": [],                         // L3 业务: array<string>; 复制 SRS ASM 项
    "single_round": false,                     // L3 业务: boolean; 单轮模式标识（继承 SRS frontmatter Single-Round 字段）
    "ui": true                                 // L3 业务: boolean; UI 特性标识，下游 wst 节点按此裁剪测试类别
  }
]
```

### 字段层级与引擎处理

| 层级 | 字段 | 引擎处理 |
|---|---|---|
| **L1 必填** | `id`、`status` | 强校验：id 全局唯一、status 类型必须 string；缺失或类型错拒绝灌入 |
| **L2 推荐** | `title`、`description`、`priority`、`dependencies` | 缺失允许；`priority` 若给出须 ∈ enum |
| **L3 业务** | `category`、`srs_trace`、`verification_steps`、`tech_stack`、`constraints`、`assumptions`、`single_round`、`ui` | 引擎透传不校验；下游 wd/red/green/refactor/wst 按这些字段裁剪行为 |
| **L4 扩展** | 任意未声明字段 | `extensionFieldsAllowed: true`；body skill 可用 `{{loop.task.<field>}}` 引用 |

**字段规约要点**：
- `status`：单一事实源由 loop 引擎根据 `doneValues=["passing"]` 管理；init 阶段始终把所有 task 的 status 初始化为 `"failing"`；任务完成由 wst 节点 `bp-advance ok` 自动翻转
- `id`：建议数字（1, 2, 3, ...），便于排序与依赖引用；string 也合法但需保持全局唯一
- `dependencies`：仅引用本批次内已存在的 task id；不得跨 loop 迭代引用
- `srs_trace`：每个 FR-xxx / NFR-xxx 至少出现在一个 task 的 `srs_trace` 中（无孤立需求）
- `verification_steps`：行为场景（Given/When/Then）格式；至少 1 步含 3+ 链式操作（最低复杂度门）
- `ui` / `tech_stack` / `constraints` / `assumptions`：从 SRS / project-context.md 继承，下游 wd/red/green/refactor/wst 节点会按这些字段裁剪行为

源项目 `feature-list.json` 的根层级字段（`project` / `tech_stack` 根级 / `quality_gates` / `waves` / `required_configs` 等）**不进 iter-tasks.json** —— 这些已在 Step 2 落到 `{{HARNESS_MEMORY_DIR}}/plans/project-context.md`，下游节点直接读 project-context.md，或通过 `{{VARS_GET}}` 读 state.variables（若蓝图把它们提升为变量）。

## 关键规则

- **主 agent 不读 SRS / Design / ATS 全文** —— sub-skill 在其 SubAgent 上下文自行加载；主 agent 只按 evidence + next_step_input 做决策
- **env-guide.md frontmatter 审批字段由主 agent 写** —— sub-skill 永不修改 `approved_by` / `approved_date` / `approved_sections`
- **每步 sub-skill 返回都走 approval-revise-loop** —— 统一 approve / revise / escalate 闸门；bootstrap 为零审批快通
- **iter-tasks.json 单一写者** —— 仅 features sub-skill 写入；env / bootstrap 只读 tech_stack
- **Step 10 灌入 loop 由主 agent 完成** —— 任何 sub-skill 不在 evidence 中触发自动灌入

## 阻塞 / 失败

- env-guide 子 skill 同一前缀 3 次 blocked → `bp-advance blocked --notes='[ENV-GUIDE-BLOCKED]'`
- bootstrap 子 skill `bash -n` / PowerShell parser 失败无法修复 → `bp-advance blocked --notes='[BOOTSTRAP-SYNTAX-FAIL]'`
- features 子 skill sizing 关卡 `manual-adjust` 后字段非法 → `bp-advance failed --notes='[FEATURES-SCHEMA-FAIL]'`
- {{TASKS_SET}} 灌入失败（schema 校验未通过）→ `bp-advance failed --notes='[TASKS-SEED-FAIL]'`
