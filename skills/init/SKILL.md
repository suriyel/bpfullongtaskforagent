---
name: init
description: "当 ATS 文档存在（或自动跳过）但 features 任务清单未生成时使用 — 打包项目骨架、分发 init-env sub-skill 生成 env-guide.md + 主 agent 直接生成 init.sh / features[]，然后 git init 并灌入 iter loop"
---

**语言规则**：用中文（简体）回复用户。所有生成的文档、报告和面向用户的输出必须用中文编写。Skill 名称、代码标识符和 JSON 字段名保持英文。

# 初始化 Long-Task 项目

在 SRS / Design / ATS 都获批后运行一次。通过 `init_project.cjs` 打包确定性骨架；Step 3 分发 init-env SubAgent 产 env-guide.md；Step 4 / 5 主 agent 直接执行（init.sh / init.ps1 / features[] / check_configs.py）。然后 git init 并把 features[] 灌入 iter loop。工作流导航全部由蓝图 DAG + auto-loop 承担，不再生成独立的工作流引导文档。

## 输入文档

| 文档 | 位置 | 提供 |
|----------|----------|----------|
| **SRS** | `{{HARNESS_MEMORY_DIR}}/plans/srs.md` | FR / NFR / CON / ASM / IFR / 术语表 / 角色 / 验收标准 |
| **Design** | `{{HARNESS_MEMORY_DIR}}/plans/design.md` | 技术栈、架构、数据模型、API 设计、§6.1 任务分解、§6.2 依赖链 |
| **UCD**（如有 UI）| `{{HARNESS_MEMORY_DIR}}/plans/ucd.md` | 色板 / 字体 / 间距 token、组件级 prompt、页面级 prompt — 仅在 ucd 节点产出该文件时存在 |
| **ATS** | `{{HARNESS_MEMORY_DIR}}/plans/ats.md`（可选，≤5 FR 时可缺失）| 需求→场景映射、每条需求所需测试类别（通过 srs_trace 约束 `ui` 标记与下游 feature-st 类别要求）|
| **用户原始诉求** | `{{HARNESS_MEMORY_DIR}}/intent/user-original-intent.md` | 蓝图启动时用户原话（scan 节点固化）；用于背景对齐与 task[] 元数据校验，**不**作为决策依据 |

主 agent 在 Step 4 / 5 内联执行时**直接读取**上述文档（不再委派 SubAgent 自行加载）；Step 3 仍由 init-env SubAgent 在独立上下文中加载所需章节。

## 共享资产

- **返回契约**：`{{SHARE-REFERENCE}}/structured-return-contract.md`（若存在；仅 init-env SubAgent 使用）
- **审批-返工循环**：`{{SHARE-REFERENCE}}/approval-revise-loop.md`（approve / revise / escalate；2 轮封顶；env §3/§4 合并审批；Addendum 组装）

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
  --lang=<python|java|typescript|c|cpp|go> \
  --test-framework=<...> --coverage-tool=<...>
```
- `<project-name>` 来自 SRS 标题
- `<language>` 来自 Design §1.4 技术栈
- 可选 `--line-cov` / `--branch-cov` 覆盖默认阈值（90 / 80）

本步产出：`{{HARNESS_MEMORY_DIR}}/plans/project-context.md`（含 tech_stack / quality_gates / constraints / assumptions）+ `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md` + `RELEASE_NOTES.md` + `examples/`（保留在 cwd 根作发布产物）。

### 3. 生成 env-guide.md（DISPATCH SubAgent）

> **DISPATCH** → 创建独立 SubAgent（{{AGENT}}），在 subagent 中加载并执行 skill `init-env`
> **input**: `project_lang`（来自 init_project.cjs 写入的 project-context.md tech_stack）
> **expect**: Structured Return Contract；`artifacts_written=["{{HARNESS_MEMORY_DIR}}/notes/env-guide.md"]`；`next_step_input` 含 `services[]` / `env_activation_cmd` / `build_cmd` / `test_cmd` / `coverage_cmd` / `tool_version_pins` / `ui_detected`

按 `{{SHARE-REFERENCE}}/approval-revise-loop.md` 处理。**§3 与 §4 合并在同一关卡审批**——approve 时主 agent 更新 env-guide.md frontmatter `approved_by` / `approved_date` / `approved_sections: ["§3", "§4"]`。

### 4. 生成 init.sh / init.ps1（主 agent 直接执行）

主 agent 阅读 `references/init-script-recipes.md` 查找匹配 tech_stack + env-manager 的模板，按以下流程产出脚本：

**输入收集**：
- `tech_stack`（来自 `{{HARNESS_MEMORY_DIR}}/plans/project-context.md`）：language / runtime_version / frameworks
- `env_activation_cmd`（来自 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §2`）
- `build_cmd` / `test_cmd`（来自 env-guide.md §3）

**检测 env 管理器**（按 language 推断）：

| 语言 | env 管理器候选 |
|---|---|
| Python | miniconda / conda / mamba / venv / poetry / pipenv / uv / pyenv |
| Node.js | nvm / fnm / volta / corepack |
| Java | sdkman / jenv |
| C / C++ | CMake / conan / vcpkg |
| 通用 | devcontainer / docker / nix |

**脚本要求**（同时生成 init.sh + init.ps1）：

- **幂等**：可安全重跑（已有环境复用 guard）
- **Fail-fast**：`set -euo pipefail` / `$ErrorActionPreference = "Stop"`
- **版本锁**：按 Design §1.4 依赖表锁确切版本（禁用 `latest`）
- **自诊断**：末尾打印检测到的工具版本
- **无交互**：全部 `-y` 自动接受
- **可移植路径**：`"$(dirname "$0")"` / `$PSScriptRoot`
- **必需步骤**：运行时版本 → 环境创建 → 激活 → 依赖安装 → dev 工具 → 版本 verify

**语法自检（硬要求）**：

```bash
bash -n init.sh
pwsh -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('init.ps1', [ref]\$null, [ref]\$null)"
```

主机无 `pwsh` 用 `powershell` 同义命令；两者皆不可用 → AskUserQuestion 决定跳过 PS 自检或中止。任一失败 → 主 agent 修脚本后重跑自检（最多 2 轮，第 3 次自动 escalate）。

### 5. 生成 features[] + check_configs（主 agent 直接执行）

主 agent 按下列 4 子步顺序完成全部产物。工作流导航（Orient/Bootstrap/TDD Red-Green-Refactor/Persist 等阶段切换）由蓝图 DAG + auto-loop 承担；命令执行从 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §1-§3 读取；阈值与技术栈从 `{{HARNESS_MEMORY_DIR}}/plans/<topic>-feature-list.json` 的 `tech_stack` / `quality_gates` 字段读取。完整 Feature List Schema 字段表与赋值引导见本 SKILL.md 末尾 §Feature List Schema 段。

#### 5.1 抽取 features[]（严格按 §Feature List Schema）

输入：`{{HARNESS_MEMORY_DIR}}/plans/{srs,design,ats,ucd}.md` + `project-context.md`。

按 §Feature List Schema §A 构造完整 feature-list.json 根结构（project / created / tech_stack / quality_gates / waves / constraints / assumptions / required_configs / features）；features[] 元素严格按 §B 字段表 + §D 字段赋值引导填充。

**关键约束**：
- 每个 feature 的 `status` 初始一律 `"failing"`（loop 引擎按 `doneValues=["passing"]` 判定完成）
- 每个 feature 至少 1 个 `srs_trace` 元素；FR / NFR / IFR 全覆盖（自检见 `references/feature-validation.md` §A）
- `ui: true` 的 feature 必须含 `[devtools]` 视觉断言 verification_step（自检见 §G）
- `category: "ui"` 的 feature 必须列出后端依赖（自检见 §H）

**粒度按 `references/feature-decomposition.md` LOC 估算公式与 small/ok/large 分类带**：完成抽取后向用户呈现 loc_distribution + feature_summary，AskUserQuestion **sizing 关卡** 三选一：

| 选项 | 处理 |
|---|---|
| `y` (approve) | 直接通过；进入 5.2 |
| `auto-fix` | 按 references/feature-decomposition.md 拆分/合并规则自动调整；最多 2 轮 |
| `manual-adjust` | 主 agent 暂停，提示用户直接编辑 `{{HARNESS_MEMORY_DIR}}/plans/<topic>-feature-list.json`；resume 后只重跑 5.3 自检，不重算 sizing |

#### 5.2 生成 check_configs.py + .env.example

读 SRS §7 IFR + Design API 探测：
- API key / 服务 URL → type `env`（`required_configs[].type="env"`，`key=ENV_VAR`）
- 配置文件 / 证书 → type `file`（`required_configs[].type="file"`，`path="path/to/file"`）
- 每条 `required_by` 关联到相应 feature.id 数组；`check_hint` 给出设置说明

**`.env.example`**（项目根，每 env 类型 config 一块注释模板）：

```
# <name> — <description>
# Hint: <check_hint>
# Required by features: <required_by ids>
<KEY>=
```

`.env` 加入项目根 `.gitignore`；`.env.example` 可安全提交。

**`check_configs.py`**（项目根，由 wd / red / green 等节点 Bash 直调）：
- 按 `tech_stack.language` + Design 选加载方式（dotenv / Spring properties / YAML / 系统 env）
- 接口：`python check_configs.py --feature <id>`，从 feature-list.json.required_configs 拿对应 feature 的必需 config
- env 类型查 `os.environ`，file 类型查 `os.path.exists`
- 打印缺失的 `name` + `check_hint`；Exit 0 全存在 / Exit 1 缺失任一
- **加载逻辑硬编码**，不要 `--dotenv` / format 标志

#### 5.3 自检（严格按 `references/feature-validation.md`）

按该协议 A–K 11 项规则逐条过：orphan FR / feature 字段完整性 / 依赖环 / wave 拓扑 / 11 节齐全 / UI 视觉断言 / 前后端依赖 / required_configs / check_configs.py 可执行 / tech_stack 一致性。

任一失败 → 主 agent 修复；无法自动修复 → 回到 5.1 重新抽取或 AskUserQuestion 让用户决策。**不在自检未通过时直接 advance**（gate_init 硬门也会拦截，但本节点内 resolve 更便宜）。

#### 5.4 灌入 iter loop（{{TASKS_SET}}）

把完整 feature-list.json 落 `{{HARNESS_MEMORY_DIR}}/plans/<topic>-feature-list.json`（含全部根字段供调试 / Worker 查阅），然后执行 {{TASKS_SET loop=iter file={{HARNESS_MEMORY_DIR}}/plans/<topic>-feature-list.json}} 将特性清单灌入 iter loop。

引擎 `extractItemsArray` 按 `features` 键提取 items[]（容器形状 B）；根字段（tech_stack / quality_gates / waves / required_configs / constraints / assumptions）落盘归档，不进 loop state。下游 worker 通过 `{{TASK_GET}}` 拿当前 feature。

**漏调后果**：下游 `iter` loop 入口检测 `state.loops.iter.tasks` 为空 → halt（reason: `loop_no_tasks_seeded`）。

### 6. 脚手架项目骨架

基于设计文档架构创建源码目录（如 `src/`、`tests/`、语言特定子目录）。本步不创建业务代码——仅空目录 + `.gitkeep` 或 README 占位。

### 7. Git init 与初始提交

```bash
git init
git add -A
git commit -m "chore: initialize long-task project scaffold

- <N> features seeded into iter loop (via Step 5.4 {{TASKS_SET}})
- env-guide.md
- init.sh / init.ps1 bootstrap scripts
- .env.example + check_configs.py
"
```

如本目录已有 git 历史（Step 1 `git log` 已确认），跳过 `git init`，直接 `add -A` + commit。

### 8. 运行 init 脚本并校验环境

- 运行 `bash init.sh`（Unix）或 `pwsh ./init.ps1`（Windows），确认环境安装无错误
- 激活环境后执行 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §3 定义的测试命令，确认可执行（此时特性全部 failing 是预期的）
- 任何失败 → 诊断根因，修 `init.sh` / `init.ps1` / `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` / `check_configs.py`，重跑
- **不要**在此启动服务——服务在 Worker / ST 阶段按 `env-guide.md` §1 启动

### 9. 更新 task-progress.md

- 在 `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md` 追加 `## Session 0 — Init` 条目：SRS / Design / ATS 路径引用、特性总数、UI 特性数、config 数
- **不**写 `## Current State` 进度条——当前状态由蓝图 loop 引擎 state 管理

完成 Step 9 后主 agent advance ok；蓝图引擎自动推进到 `gate_init` 硬门（校验 SRS / Design / ATS / feature-list.json / init.sh / check_configs.py 落盘合法）→ 通过则进入 iter loop。

<!-- tasks-schema: default -->
## §Feature List Schema

本段固化 feature-list.json 完整结构与 features[] 字段表，与 `blueprint.json.tasksSchemas.default` 同源（修改两处同步）。Step 5.1 严格按此抽取。

> 项目 schema 硬约束依据：`server-blueprint/bp-tasks-schema.js` (L1_FIELDS / L2_FIELDS / DEFAULT_DONE_VALUES) + `harness-blueprint-adapter/references/task-decomposition.md` 模板 A + `harness-blueprint-adapter/references/blueprint-contract.md`。

### §A 根结构（feature-list.json）

```json
{
  "project": "project-name",
  "created": "YYYY-MM-DD",
  "tech_stack": {
    "language": "python|java|typescript|c|cpp|go",
    "test_framework": "pytest|junit|vitest|gtest|...",
    "coverage_tool": "pytest-cov|jacoco|c8|gcov|..."
  },
  "quality_gates": { "line_coverage_min": 90, "branch_coverage_min": 80 },
  "waves": [
    { "id": 0, "date": "YYYY-MM-DD", "description": "Initial release" }
  ],
  "constraints": ["Hard limit — one string per item (源 SRS §6 CON-)"],
  "assumptions": ["Implicit belief — one string per item (源 SRS §6 ASM-)"],
  "required_configs": [
    {
      "name": "Display name", "type": "env|file",
      "key": "ENV_VAR",  "path": "path/to/file",
      "description": "...", "required_by": [1, 3], "check_hint": "..."
    }
  ],
  "features": [ /* items[] — 见 §B */ ]
}
```

**`current` 字段**：源项目用 `current = null | {feature_id, phase}` 做 phase 路由；harness DAG + loop 引擎 `selectStrategy: first-pending` 已替代，**不再使用**。

### §B features[] 元素字段表

| 层级 | 字段 | 类型 / 枚举 | 说明 |
|---|---|---|---|
| **L1 必填**（引擎硬编码）| `id` | string \| number | feature 全局唯一 |
| **L1 必填**（引擎硬编码）| `status` | string | default `"failing"`；doneValues=`["passing"]`；引擎按此判定 done |
| **L1 必填**（引擎硬编码）| `dependencies` | array<id> | default `[]`；loop 引擎按此判 dep-ready |
| **L2 推荐** | `title` | string | feature 标题 |
| **L2 推荐** | `priority` | enum `"high"\|"medium"\|"low"` | MoSCoW 投影 |
| **L2 推荐** | `dependencies` | array | 重声明（与 L1 同源，UI / 排序用）|
| **L3 自定义** | `description` | string | feature 详述（模板 A 标准位置）|
| **L3 自定义** | `wave` | number | 所属 wave.id（与根 `waves[].id` 关联）|
| **L3 自定义** | `category` | enum `"core"\|"ui"\|"api"\|"infra"\|"nfr"` | 模板 A 标准 4 值 + `nfr`（NFR 衍生 feature 专用，不参与覆盖率关卡） |
| **L3 自定义** | `srs_trace` | array<string> | SRS FR- / NFR- / IFR- 编号反向锚定 |
| **L3 自定义** | `verification_steps` | array<string> | feature 完成后人工 / 脚本校验步骤 |
| **L3 自定义** | `ui` | boolean | 是否产生 UI 改动（决定下游 wst 节点是否激活 UI 测试）|
| **L3 自定义** | `ui_entry` | string | UI 入口路径（仅当 `ui=true`）|
| **L3 自定义** | `single_round` | boolean | 单轮模式标记（来自 req Step 11b）|

**L1 字段说明**：`bp-tasks-schema.js` 中 `L1_FIELDS = { id, status, dependencies }`；这三项**始终强制**，即使 schema 未在 `requiredFields` 显式声明。L2 仅含 `title` / `priority`（代码 `L2_FIELDS`），其余字段无论标准化字段名（`description` / `srs_trace` 等）一律走 L3 `userFields`。

**示例 feature item**：

```json
{
  "id": 1,
  "title": "登录表单组件",
  "status": "failing",
  "priority": "high",
  "dependencies": [],
  "wave": 0,
  "category": "ui",
  "description": "邮箱 + 密码字段、必填校验、submit 触发回调",
  "srs_trace": ["FR-001", "FR-003"],
  "verification_steps": [
    "页面渲染表单",
    "空提交报错",
    "[devtools] 页面显示「登录」按钮且初始 disabled",
    "成功 submit 调回调"
  ],
  "ui": true,
  "ui_entry": "/login"
}
```

### §C 任务文件容器形状 + {{TASKS_SET}} 灌入

引擎 `extractItemsArray` 支持 4 种容器形状（first-match 解析）：

| 形状 | 写法 | 用途 |
|---|---|---|
| 直接数组 | `[ ... ]` | 推荐（最纯净），但不含根字段 |
| features 包装 | `{ "features": [...] }` | **本蓝图选用**（保留根字段供调试 / Worker 查阅）|
| tasks 包装 | `{ "tasks": [...] }` | 通用 |
| items 包装 | `{ "items": [...] }` | 通用 |

灌入调用（见 Step 5.4）：执行 {{TASKS_SET loop=iter file={{HARNESS_MEMORY_DIR}}/plans/<topic>-feature-list.json}}。

灌入语义：
- 整个 feature-list.json 落 `{{HARNESS_MEMORY_DIR}}/plans/<topic>-feature-list.json`（根字段供调试 / Worker 查阅）
- 引擎按 `features` 键提取 items[]（容器形状 B）
- loop 引擎仅消费 features[]；根字段（tech_stack / quality_gates / waves / required_configs / constraints / assumptions）落盘归档，不进 loop state
- iter loop 内 worker 节点（wd / red / green / refactor / wst）通过 `{{TASK_GET}}` 拿当前 feature

### §D 自定义字段赋值引导

主 agent 执行 Step 5.1 时按此表逐字段填充：

| 字段层级 | 字段 | 赋值来源 |
|---|---|---|
| 根 | `tech_stack.language` | 优先 SRS §6 Constraints 显式指定；否则探测 package.json / pom.xml / pyproject.toml / Cargo.toml / CMakeLists.txt |
| 根 | `tech_stack.test_framework` | package.json devDependencies (vitest / jest) / pom.xml (junit / testng) / pyproject.toml dev-dependencies (pytest) |
| 根 | `tech_stack.coverage_tool` | 与 test_framework 配套：vitest→c8、pytest→pytest-cov、junit→jacoco、gtest→gcov |
| 根 | `quality_gates.line_coverage_min` | 优先 SRS §5 NFR 覆盖率 NFR；缺省 90；CLI / utility 类项目可降至 80 |
| 根 | `quality_gates.branch_coverage_min` | 缺省 80；与 line_coverage_min 同源 |
| 根 | `waves[].id` / `waves[].description` | 按 features[].dependencies 拓扑排序分波：无依赖 features → wave 0；依赖 wave N 的 → wave N+1；最深 ≤3 wave |
| 根 | `constraints[]` / `assumptions[]` | 直接从 SRS §6 CON- / ASM- 转写（字符串数组，去 ID 前缀）|
| 根 | `required_configs[]` | 探查 SRS §7 接口 + Design API：每个外部依赖 → 一条 env / file config |
| feature L1 | `id` | 从 1 起递增；与 SRS FR ID 不耦合 |
| feature L1 | `status` | 初始一律 `"failing"`；worker 完成后引擎自动改 `"passing"` |
| feature L1 | `dependencies` | feature id 数组；初始可为 `[]`；按业务依赖填 |
| feature L2 | `title` / `priority` | 从 SRS FR title + MoSCoW 优先级映射 |
| feature L3 | `description` | 从 SRS FR description / AC 浓缩；≤200 字 |
| feature L3 | `wave` | 与根 waves[].id 关联，按 dependencies 拓扑层级 |
| feature L3 | `category` | feature 性质判定：UI 改动 → `"ui"`；后端接口 → `"api"`；基础设施 / CI / 配置 → `"infra"`；**NFR 衍生 feature**（`srs_trace` 仅含 `NFR-xxx`，如性能 / 可用性 / 安全度量类）→ `"nfr"`（不参与覆盖率关卡）；其他业务核心 → `"core"` |
| feature L3 | `srs_trace` | 从 SRS §4 FR / §5 NFR / §7 IFR 抽取 ID；每条 feature ≥1 个 trace；orphan FR（无 feature trace）入 `references/feature-validation.md` 校验 |
| feature L3 | `verification_steps` | 从 SRS AC 转写为可执行步骤；wst 节点会消费 |
| feature L3 | `ui` | feature 描述含 UI 语义（页面 / 组件 / 交互）→ `true` |
| feature L3 | `ui_entry` | 仅当 `ui=true`；从 Design 路由或 srs_trace 推断 |
| feature L3 | `single_round` | 来自 req Step 11b 的 SRS frontmatter `Single-Round: Yes` |

## 关键规则

- **Step 3 init-env SubAgent 边界**：主 agent 不读 env-guide 全文；只按 evidence + next_step_input 做决策；env-guide.md frontmatter `approved_by` / `approved_date` / `approved_sections` 由主 agent 写，sub-skill 永不修改
- **Step 4 / 5 主 agent 内联**：主 agent **直接读** SRS / Design / ATS / project-context.md，按 `references/` 中各协议执行；不再委派 SubAgent
- **feature-list.json 单一写者**：Step 5.4 由主 agent 写到 `{{HARNESS_MEMORY_DIR}}/plans/<topic>-feature-list.json`；后续节点只读
- **{{TASKS_SET}} 灌入是硬要求**：Step 5.4 漏调下游 iter loop halt（reason: `loop_no_tasks_seeded`）
- **gate_init 在 Step 9 之后自动触发**：主 agent 完成 9 后 advance ok；蓝图引擎根据 DAG 边推进到 gate_init → iter loop

## 阻塞 / 失败

- Step 3 env-guide 同一前缀 3 次 blocked → `bp-advance blocked --notes='[ENV-GUIDE-BLOCKED]'`
- Step 4 `bash -n` / PowerShell parser 失败无法修复 → `bp-advance blocked --notes='[BOOTSTRAP-SYNTAX-FAIL]'`
- Step 5.3 自检任一关卡失败且无法自动修复（A–E, G–K，详见 references/feature-validation.md）→ AskUserQuestion；用户中止 → `bp-advance failed --notes='[FEATURES-VALIDATION-FAIL]'`
- Step 5.4 {{TASKS_SET}} 灌入失败（schema 校验未通过）→ `bp-advance failed --notes='[TASKS-SEED-FAIL]'`
- Step 8 init 脚本无法在本机运行（环境管理器缺失等）→ AskUserQuestion 让用户决定切换或中止
