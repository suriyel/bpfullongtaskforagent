# Init 节点执行规则（业务正文）

本文件承载主 SKILL.md 之外的初始化执行细节：三个 SubAgent 派发规约、双闸门审批流程（env-guide §3/§4 合并审批 + features sizing 关卡）、以及脚手架 / Git / 校验 / 进度记录 / 交接的执行步骤。SKILL.md 顶部已声明读取本文件。

---

## § Sub-skill 派发

主 agent 在生成 `feature-list.json` 骨架并完成基本资产复制之后，按下列顺序派出三个独立 SubAgent。每个 SubAgent **使用 Claude Agent 工具（General/Agent）独立上下文**加载并执行对应的子能力，主 agent 只持有 orchestration + 用户交互职责，不读 SRS / Design / ATS 全文。

### § init-env — 生成 env-guide.md

> **使用 Agent 工具分发独立 SubAgent** — 在 subagent 中加载并执行 sub-skill `long-task-init-env` 的业务逻辑（参见 `{{HARNESS_MEMORY_DIR}}/notes/long-task-init-env.md` 或源插件 skill）。
> **input**: `project_lang`（来自任务结构 `tech_stack.language` 字段）。
> **expect**: Structured Return Contract；`artifacts_written=["env-guide.md"]`；`next_step_input` 含 `services[]` / `env_activation_cmd` / `build_cmd` / `test_cmd` / `coverage_cmd` / `tool_version_pins` / `ui_detected`。

env-guide.md 内容六节（由 SubAgent 内部完成；主 agent 仅校验返回）：

- **§1 服务生命周期** — Services 表 + Start All / Verify / Stop All / Verify Stopped + 4 步重启协议（双平台 Unix + Windows）。复杂启动（>2 shell 步）抽出到 `scripts/svc-<slug>-start.sh` 并引用。
- **§2 环境配置** — 环境激活命令、必需环境变量、配置加载（引用 `.env.example` 与 `scripts/check_configs.py`）。
- **§3 构建与执行命令** — Build / Unit tests / Coverage / Static analysis 全部按静默执行模板（`<cmd> > /tmp/<tag>-$$.log 2>&1; echo $? > /tmp/<tag>-$$.exit`）。含工具版本锁与 Re-check 协议（永不全量重跑）+ 工具/环境故障 Fallback（诊断 → init.sh / §1 → 重试一次 → 仍失败 `[ENV-ERROR]` 前缀 blocked）。
- **§4 存量代码库约束** — §4.1 强制内部库、§4.2 禁用 API、§4.3 代码样式基线、§4.4 构建系统约定。直接从 `{{HARNESS_MEMORY_DIR}}/notes/rules/*.md` 提取；Static Analysis 命令进 §3 不进 §4；greenfield 写 `_(empty — greenfield project)_` 占位但保留所有子节。
- **§5 测试环境依赖** — DB / 消息队列 / 三方件本地副本配置，Chrome DevTools MCP 启动命令（仅 UI 项目），WireMock / MockServer / testcontainers 设置。
- **§6 人类审批记录** — 历史表（Date / Version / Approved By / Change Summary），初次生成预填一行，Approved By 留 `null` 待主 agent 写入。

Frontmatter（首次生成豁免）：
```yaml
---
version: 1.0
approved_by: null
approved_date: null
approved_sections: []
---
```

### § init-bootstrap — 生成 init.sh / init.ps1

> **使用 Agent 工具分发独立 SubAgent** — 在 subagent 中加载并执行 sub-skill `long-task-init-bootstrap` 的业务逻辑。
> **input**: 自行从 `tech_stack` + env-guide.md §2 / §3 定位。
> **expect**: Structured Return Contract；`artifacts_written=["init.sh", "init.ps1"]`；`next_step_input` 含 `env_manager` / `runtime_version` / `install_commands`；`evidence` **必含** `"bash -n clean"` 与 PowerShell parser 通过记录。

零审批直通：确定性输出 + 内置语法自检。`status: pass` 即跳到下一步。`fail` / `blocked` 按审批-返工循环处理。

脚本要求（由 SubAgent 落实）：

- **幂等** — 可安全重跑（已有环境复用 guard）
- **Fail-fast** — `set -euo pipefail` / `$ErrorActionPreference = "Stop"`
- **版本锁** — 按 Design 依赖表锁确切版本（禁用 `latest`）
- **自诊断** — 末尾打印检测到的工具版本
- **无交互** — 全部 `-y` 自动接受
- **可移植路径** — `"$(dirname "$0")"` / `$PSScriptRoot`
- **必需步骤** — 运行时版本 → 环境创建 → 激活 → 依赖安装 → dev 工具 → 版本 verify

自检（硬要求，evidence 必含两条通过记录）：
```bash
bash -n init.sh
pwsh -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('init.ps1', [ref]$null, [ref]$null)"
```

主机无 `pwsh` 用 `powershell` 同义命令；两者皆不可用 → `blocked` + blocker `["pwsh-not-available"]`。

### § init-features — 生成 long-task-guide.md + 填充 feature-list 字段

> **使用 Agent 工具分发独立 SubAgent** — 在 subagent 中加载并执行 sub-skill `long-task-init-features` 的业务逻辑。
> **input**: 自行从 SRS / Design / ATS / env-guide.md / `tech_stack` 定位。
> **expect**: Structured Return Contract；`artifacts_written` 含 `{{HARNESS_MEMORY_DIR}}/notes/long-task-guide.md` / `.env.example` / `.gitignore` / `scripts/check_configs.py` 以及对应任务结构字段更新；`next_step_input` 含 `feature_count` / `loc_distribution` / `feature_summary` / `ui_feature_count` / `config_count` / `nfr_feature_count` / `single_round` / `validate_guide_ok` / `validate_features_ok`。

SubAgent 内部执行 A → F 六个子阶段（业务正文保留，供主 agent 审批时复核）：

**A. 生成 `long-task-guide.md`**（写到 `{{HARNESS_MEMORY_DIR}}/notes/long-task-guide.md`）
- 仅工作流导航，不嵌具体命令；命令引用一律写 "See `env-guide.md` §3 Build & Execution Commands" / "See `env-guide.md` §1 Service Lifecycle"
- 必需节：Orient、Bootstrap、Config Gate、TDD Red、TDD Green、Coverage Gate、TDD Refactor、Verification Enforcement、Inline Compliance Check、Persist、Critical Rules
- `Config Management` 节描述本项目 config 格式（dotenv / Spring properties / 系统 env）
- `Real Test Convention` 节给出识别方法、env-guide §3 引用、本技术栈下真实测试示例
- 仅当项目有 UI 特性时包含 UI 测试节（Chrome DevTools MCP 工具名）

**B. 填充 SRS 字段**
- `constraints[]` ← SRS "Constraints" 节 CON-xxx（每条一字符串）
- `assumptions[]` ← SRS "Assumptions & Dependencies" 节 ASM-xxx
- NFR-xxx → 追加为 `category: "non-functional"` 特性，`srs_trace: ["NFR-xxx"]`，覆盖率关卡不适用
- SRS frontmatter `Single-Round: Yes` → 根置 `"single_round": true`

**C. 从 Design §6.1 填充核心特性**
- 每 §6.1 行 → 一特性：`srs_trace` ← "Mapped FRs" 列；`title` + `description` ← 特性名 + 被分组 FR；`priority` ← P0/P1→high, P2→medium, P3→low；`dependencies` ← §6.2 依赖链；`status` 始终 `"failing"`
- UI 特性（srs_trace 任一 FR 的 ATS 类别含 UI）→ `ui: true` + `ui_entry: "/path"`；至少 1 条带 `[devtools]` 前缀的 verification_step 断言**正面视觉存在**
- 前端特性 `dependencies[]` 必须列出后端 API 依赖特性
- 排序遵循 §6.1 行顺序
- 内部校验关卡：每 FR-xxx 必须至少出现在一个特性的 srs_trace（无孤立需求）→ 否则 `blocked`，blockers `["ats-srs-trace-orphan: FR-xxx"]`；每特性 srs_trace 非空 → 否则 `blocked`

**D. LOC 估算与 sizing 带分类**

公式（透明可复核）：
```
est_loc = (sum of AC counts × 80) + (interface-contract method count × 100) + (test-inventory estimated rows × 30)
```
- AC 数来自 SRS srs_trace 需求
- method / test 数本阶段为估值（Design §4 参考）

分类：
- `< 500` → small
- `500–1500` → ok
- `> 1500` → large
- `single_round: true` 模式上限放宽到约 2000

**不在 sub-skill 内做合并/拆分决策**：只计算分布并通过 `next_step_input.loc_distribution` + `feature_summary` 返回，由主 agent 持 sizing 关卡。

**E. `required_configs` + `.env.example` + `scripts/check_configs.py`**
- API key / 服务 URL → type `env`；配置文件 / 证书 → type `file`
- 每条 `required_by` 关联到相应特性 ID 数组；`check_hint` 给出设置说明
- `.env.example` 每 env 类型 config 一块注释模板（含 description / hint / required_by ids / KEY=）
- `.env` 加入 `.gitignore`；`.env.example` 可安全提交
- `scripts/check_configs.py` 按 `tech_stack.language` + Design 选加载方式（dotenv / Spring properties / YAML / 系统 env），接口 `python scripts/check_configs.py feature-list.json [--feature <id>]`，env 类型查 `os.environ` / file 类型查 `os.path.exists`，缺失打印 `name` + `check_hint`；Exit 0 全存在 / Exit 1 缺失。**加载逻辑硬编码**，不要 `--dotenv` / format 标志。

**F. 校验**
- 内部执行 `validate_features` / `validate_guide` 校验（脚本路径由 SubAgent 自己解析）；两者均通过 → `status: pass`；任一失败 → `status: fail`，evidence 附 stderr。

---

## § 审批流程

### § env-guide 审批（§3/§4 合并审批）

按"审批-返工循环"通用规则处理 init-env SubAgent 的返回：

- **§3 与 §4 合并在同一关卡审批** — approve 时主 agent 更新 env-guide.md frontmatter `approved_by` / `approved_date` / `approved_sections: ["§3", "§4"]`（**主 agent 写**，sub-skill 永不修改这三个字段）
- approve / revise / escalate 三态，2 轮封顶；revise 时主 agent 用 Failure Addendum 组装新输入重发 SubAgent
- §3 漂移（Static Analysis 错置 §4 / 命令格式不符静默模板）→ revise
- §4 内部库 / 禁用 API 与 `{{HARNESS_MEMORY_DIR}}/notes/rules/` 不一致 → revise
- 模板缺失（`docs/templates/env-guide-template.md`）→ SubAgent 返回 `fail`，主 agent escalate
- user 声称 brownfield 但 rules 完全为空 → SubAgent 返回 `blocked` with `["missing-docs-rules-coding-constraints"]`，主 agent 用 AskUserQuestion 后再决策

### § init-bootstrap 零审批快通

`status: pass` 直接进下一步；`fail`（语法自检失败）/ `blocked`（`pwsh` 不可用 / 语言不在 recipes）按返工循环处理：主 agent Addendum 指明缺失项要求 SubAgent 重产或主 agent 手工补 PowerShell。

### § sizing 关卡（features 审批**前**先走）

init-features SubAgent 返回后，主 agent **先走 sizing 关卡**再走通用审批。基于 `next_step_input.loc_distribution`（small / ok / large 计数）+ `feature_summary`（每特性 est_loc + band）向用户呈现分布，AskUserQuestion 三选一：

- **`y` → approve 通过** — 直接进入通用审批关卡校对其余 next_step_input 字段（feature_count / ui_feature_count / config_count / validate_*_ok），通过即 commit。
- **`auto-fix` → 重分发** — 主 agent 用 Addendum `"按 loc_distribution 中 small/large 特性执行合并/拆分；保持 srs_trace 覆盖率与依赖链；维持 §6.1 顺序"` 重分发 init-features SubAgent。第 2 轮仍未达标 → escalate。
- **`manual-adjust` → 暂停等待用户编辑** — 提示用户直接编辑任务结构 / `feature-list.json`；resume 后主 agent **只重跑 features 校验**（任务结构合法性 + srs_trace orphan 检查），不再重分发 SubAgent。

sizing 关卡是 features SubAgent 唯一保留人工决策点的原因：合并/拆分需要业务判断，不能机器仲裁。

---

## § 执行步骤

### Step 6 — 脚手架项目骨架

基于设计文档架构创建源码目录（如 `src/`、`tests/`、语言特定子目录）。**本步不创建业务代码** — 仅空目录 + `.gitkeep` 或 README 占位。目的是让 Step 7 的 `git add -A` 能捕获项目骨架结构。

### Step 7 — Git init 与初始提交

```bash
git init
git add -A
git commit -m "chore: initialize long-task project scaffold

- feature-list.json with N features
- env-guide.md, long-task-guide.md
- init.sh / init.ps1 bootstrap scripts
- .env.example + scripts/check_configs.py
"
```

如本目录已有 git 历史（Step 1 `git log` 已确认），跳过 `git init`，直接 `add -A` + commit。

### Step 8 — 运行 init 脚本并校验环境

- 运行 `bash init.sh`（Unix）或 `pwsh ./init.ps1`（Windows），确认环境安装无错误
- 激活环境后执行 env-guide.md §3 定义的测试命令，确认可执行（此时特性全部 failing 是预期的）
- 任何失败 → 诊断根因，修 `init.sh` / `init.ps1` / `env-guide.md` / `scripts/check_configs.py`，重跑
- **不要**在此启动服务 — 服务在 Worker / ST 阶段按 env-guide.md §1 启动

### Step 9 — 更新 task-progress.md

- 追加 `## Session 0 — Init` 条目至 `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md`：SRS / Design / ATS 路径引用、特性总数、UI 特性数、config 数
- **不**写 `## Current State` 进度条 — 当前状态由蓝图引擎 state 维护（loop iter 任务集合 + 单任务 status），不在 task-progress.md 重复

### Step 10 — 交接给迭代 Worker

主 agent 完成本节点最后一步后向用户陈述：

> 初始化完成。共生成 N 个特性（含 K 个 UI 特性、M 个 config），全部 status=failing。下一步进入迭代 Worker 循环：每个特性串行经过 design → tdd → st 三阶段，由蓝图 `iter` loop 自动调度。

主 agent **不主动开新会话**、**不在本节点内自动触发 Worker**；handoff 控制权保留在用户侧。蓝图引擎根据 DAG 边推进到 iter loop 的 body 起点。

---

## § 关键规则（节点级硬约束）

- **主 agent 不读 SRS / Design / ATS 全文** — 三个 SubAgent 在独立上下文自行加载；主 agent 只按 evidence + next_step_input 做决策
- **env-guide.md frontmatter 审批字段由主 agent 写** — sub-skill 永不修改 `approved_by` / `approved_date` / `approved_sections`
- **每步 sub-skill 返回都走审批-返工循环** — 统一 approve / revise / escalate 闸门；bootstrap 为零审批快通
- **feature-list 字段单一写者** — 仅 features sub-skill 写入；env / bootstrap 只读 `tech_stack`
- **Step 10 handoff 保留在主 agent** — 任何 sub-skill 不在 evidence 中触发自动链式 Worker 调用
