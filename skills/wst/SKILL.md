---
name: wst
description: "对**当前任务**执行黑盒 Feature-ST 验收测试（独立 SubAgent 内运行），主 agent 做 Inline 合规检查 + 最终 Persist（commit / RELEASE_NOTES / progress 落盘）"
---

# Worker — 阶段 C：Feature-ST + Inline Check + Persist

为**当前任务**走完黑盒验收测试 + 内联合规扫描 + 最终落盘。完成后由 harness 自动推进；loop 引擎按 `doneValues: ["passing"]` 把 feature.status 翻 `failing → passing`，**不要**手动 mutate 任务状态。

> **对 `category: "bugfix"` 任务**：用例聚焦回归（防止再次出现）；ST 用例覆盖原始重现步骤 + 边界场景。

## 获取当前任务

```bash
{{TASK_GET}}
```

输出 JSON，解析 `task.id` / `task.title` / `task.description` / `srs_trace` / `ui` / `category` / 其他业务字段。loop 引擎已挑好当前任务，无需手动锁定。

## 你的任务（主 agent 视角）

**核心原则**：Feature-ST 用例派生、撰写、执行在**独立 SubAgent**（依 `reference/feature-st-execution.md`）跑；Inline Check 与 Persist 在主 agent 直接执行（无 SubAgent）。

1. **读上下游文档**（单次全量 Read，禁止 offset/limit / Grep 切片）：
   - SRS：`{{HARNESS_MEMORY_DIR}}/plans/srs.md`
   - 整体设计：`{{HARNESS_MEMORY_DIR}}/plans/design.md`
   - 特性设计：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md`（`<id>` 取自 `{{TASK_GET}}`）— 用于 Inline 接口契约 / 测试清单交叉检查
   - ATS（如存在）：`{{HARNESS_MEMORY_DIR}}/plans/ats.md` — 约束 ST 必须覆盖的类别
   - UCD（仅 `ui: true`）：`{{HARNESS_MEMORY_DIR}}/plans/ucd.md`
2. 读取代码库约定（如存在）：`{{HARNESS_MEMORY_DIR}}/notes/rules/*.md`
3. 读取 SubAgent 执行规则：`reference/feature-st-execution.md`（路径相对本 SKILL.md）

## Bootstrap

按 init 阶段产物（`{{HARNESS_MEMORY_DIR}}/plans/env-guide.md` 或同等约定）激活环境。Feature-ST SubAgent **自管理**服务生命周期（启动 / 重启 / 清理），主 agent 仅确认环境与命令可用即可。

## DISPATCH Feature-ST SubAgent

> **DISPATCH** → 创建独立 SubAgent（使用 Claude `Agent` 工具或 OpenCode 平台原生 subagent 机制）
> **prompt** 含：
> - "Read the execution rules: `reference/feature-st-execution.md`"（路径相对本 SKILL.md）
> - 动态输入：`feature_id`、`task.title`、`task.description`、`srs_trace`、`ui`、`category`、`working_dir`
> - 让 SubAgent 自行从 `{{HARNESS_MEMORY_DIR}}/plans/` 解析 srs / design / ats / ucd 路径
> - 输出路径：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-test-cases.md`
> **expect**：返回结构化 `status: pass | fail | blocked` + `next_step_input` 含 `st_case_path` / `st_case_count` / `manual_case_count` / `environment_cleaned`

### 解析 SubAgent 返回

- **`status: pass`**：
  1. 提取 `next_step_input` 字段
  2. 若 `ui: true`：核查视觉评估表中每条 ≥ 3 且 Display-Only Defects = 0；任一违规则按 fail 处理
  3. 若存在 `### Manual Test Cases`：转入下方"手工测试评审关卡"
  4. 若 `environment_cleaned == false`，依 env-guide 命令自行清理
  5. 进入 Inline 合规检查
- **`status: fail`**：
  1. 读 evidence + Issues 表，定位代码 bug / 环境问题（SubAgent 应已自修；返 fail 表示超出自修能力或策略上报）
  2. 视情况以 Failure Addendum 重分发（最多 2 轮 revise），仍 fail → AskUserQuestion 收集手工诊断后重分发
- **`status: blocked`**：按 blockers[] 前缀分流并组装 AskUserQuestion：
  - `[MANUAL_TEST_REQUIRED]` — 缺凭据 / 物理设备 / 视觉判断，主 agent 呈测试步骤等待用户回报
  - `[SRS-MISSING]` / `[SRS-VAGUE]` — 规范缺口，呈 A/B/C：(A) 补 SRS / (B) 以建议解释作 assumption / (C) 打回 increment 流程
  - `[ATS-CATEGORY-MISSING-ST]` — ATS 必须类别零覆盖，呈 A/B：(A) 扩 ST 用例（Clarification Addendum 重分发） / (B) 显式豁免（留痕）
  - `[ENV-ERROR]` — 环境故障超 SubAgent 自修，呈故障详情等用户修复
  - 收集裁决后以 Clarification Addendum 重分发；**重分发前**先读特性设计文档的 `## 澄清附录` 章节，过滤已解决的同类条目避免重复提问

### 手工测试评审关卡

若 SubAgent 返回 `### Manual Test Cases` 表，对**每一行**逐条用 AskUserQuestion 收集人工裁决：

```
Manual Test Required: {Case ID}

Test Objective: {目标}
Reason for manual testing: {原因}

Preconditions:
{前置条件}

Test Steps:
{步骤摘要}

Verification Points:
{验证点}

---
Please perform this test and respond with:
Line 1: PASS or FAIL
Line 2: What you observed
Line 3: Evidence (screenshot path, log excerpt, or "none")

To skip this test temporarily, respond: SKIP {reason}
```

解析响应：
- 第 1 行 `PASS` → 追溯矩阵 `结果` = `MANUAL-PASS`
- 第 1 行 `FAIL` → `MANUAL-FAIL`
- 第 1 行 `SKIP {reason}` → `BLOCKED`（不静默跳过 — BLOCKED 被显式跟踪）
- 无法解析 → 重试一次；仍失败记 `BLOCKED`，原始响应作为证据

收集完毕后更新测试用例文档（`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-test-cases.md`）的追溯矩阵与 **Manual Test Case Summary** 表，并重新评估特性级判定：

- SubAgent 判定 PASS **且** 所有手工 `MANUAL-PASS` → 最终 **PASS**
- 任一手工 `MANUAL-FAIL` → 最终 **FAIL**（与自动化失败同等）
- 任一手工 `BLOCKED` → 最终 **BLOCKED**

最终判定为 PASS 才进入 Inline 合规检查；FAIL / BLOCKED 按上方 fail / blocked 流程分发。

## Inline 合规检查（无 SubAgent，主 agent 直接跑）

机械化检查，对 Feature-ST 完成后的磁盘状态与特性设计文档做交叉校验。

**a) 接口契约校验（P2）**：特性设计文档 `§接口契约` 表中每个 PUBLIC 方法 grep 实现文件确认签名匹配。

**b) Test Inventory ↔ 测试文件交叉（T2）**：特性设计文档 `§测试清单` 每行测试 `grep -q "{test_function_name}" {test_file}` 确认存在。

**c) 2/3方件版本（D3）**：若 `§接口契约` / `§实现摘要` 引用版本，抽查项目实际配置文件（`requirements.txt` / `package.json` / `pom.xml` / `Cargo.toml` 等）。

**d) UCD 抽查（U1，仅 `ui: true`）**：grep CSS / 样式文件找不在 UCD 色板 token 中的硬编码颜色。

**e) ST 文档完整性**：确认 SubAgent 返回的 `evidence` 中含 ST 文档校验脚本（如 `validate_st_cases.py` 或等价校验）已通过；ST 用例文档 `{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-test-cases.md` 与可追溯矩阵存在。

**e2) ATS 类别覆盖卫生**（若 `{{HARNESS_MEMORY_DIR}}/plans/ats.md` 存在）：核查 ATS 映射表中本特性 `srs_trace` 要求的每个类别在 ST 用例中至少 1 条覆盖；零覆盖 → FAIL，回 DISPATCH 段以 `[ATS-CATEGORY-MISSING-ST]` 触发扩 ST 用例。

**f) §4 / §11 存量约定全差异扫描**（若特性设计文档 `## 全局约束摘录` 章节存在或代码库约定文件存在）：

```bash
git diff HEAD~1 --name-only  # 本次 st 阶段累计变更（含 TDD 阶段）
```

对每个源文件核查：
- `§11.1` 强制内部库 — 是否调用了被替代的 API
- `§11.5` 命名约定 — 类 / 方法 / 参数名是否合规
- `§11.6` 错误处理模式 — 异常类型 / 消息格式

违规就地修复并重校。

**判定**：
- a / b / c / d / e2 / f 任一失败：就地修复重校
- e 失败：回 DISPATCH 段重跑 Feature-ST
- 全绿后才能进入 Persist

## Persist —— 最终落盘

**1. git commit**（实现 + 测试 + ST 测试用例文档）：

```bash
git add <feature-files> {{HARNESS_MEMORY_DIR}}/notes/feature-<id>-test-cases.md
git commit -m "<commit-msg>"
git rev-parse --short HEAD  # 抓 {commit_sha}
```

Commit 消息格式：若 `{{HARNESS_MEMORY_DIR}}/notes/rules/commit-conventions.md` 存在按其约定；否则默认：
- 一般特性 → `feat: <title>`
- bugfix → `fix: <title> (#<fixed_feature_id>)`

**2. 更新 `{{HARNESS_MEMORY_DIR}}/notes/release-notes.md`**（Keep a Changelog 格式）：
- 一般特性 → `### Added`
- bugfix → `### Fixed`，条目格式：`- [<bug_severity>] <title> (fixes #<fixed_feature_id>) — <root_cause>`

**3. 更新进度日志** `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md`，分隔线下追加 session 条目：

```
### Feature #<id>: <title> — PASS
- Completed: YYYY-MM-DD
- TDD: green ✓
- Quality Gates: N% line, N% branch
- Feature-ST: N cases, all PASS
- Inline Check: PASS (P2: N/N methods, T2: N/N tests, D3: OK, ATS Category: N/N, §4: N files 0 violations)
- Git: {commit_sha} <commit-type>: <title>
#### Risks                        ← 仅当有风险时
- ⚠ [Mutant] file:line — reason
- ⚠ [Coverage] metric N% — thin margin
- ⚠ [Dependency] lib==ver — patch pending
```

**风险来源**：从前阶段 Quality Gate 输出与 Feature-ST `### Risks`（如有）合并。**单一事实源**是 loop 引擎的任务状态，task-progress.md 只做人类可读日志。

**4. 再次 git commit**（进度文件）：

```bash
git add {{HARNESS_MEMORY_DIR}}/notes/task-progress.md {{HARNESS_MEMORY_DIR}}/notes/release-notes.md
git commit -m "chore: update progress — feature #<id> passing"
```

## 关键约束

- **每次循环一个特性的一个阶段** —— 本节点只做 Feature-ST + Inline + Persist
- **ST 不可绕过** —— AI 可自修（代码 bug / 环境问题）SubAgent 内部修，无重试上限；人类介入的才 blocked
- **Inline Check 全绿才 Persist** —— §4 / §11 违规必须就地修复
- **RELEASE_NOTES 与 Git SHA 同一轮 Persist 更新** —— 避免漂移
- **不要** mutate task 状态文件 —— loop 引擎按 `bp-advance ok` 自动写入 `status: passing`

## 红旗信号

| 逃避 | 正确动作 |
|---|---|
| "ST 环境炸了，我跳过" | BLOCKED，不是 skipped。Feature-ST SubAgent 内部修；真不可自修才升级。 |
| "Inline Check P2 不匹配但代码对" | 更新特性设计（§接口契约扩展协议）或回 refactor / green 修代码。 |
| "忘了 git commit SHA 就翻 status" | 严禁。先 commit，抓 SHA，再上报。状态翻转由 loop 引擎处理。 |
| "ATS 类别缺 ST 用例，我就把 ATS 改小点" | 不行。回 DISPATCH 段扩 ST 用例，或正式走 increment 修订 ATS。 |
| "顺便跑系统级 ST" | 终止。system-wide ST 是下游 `st` 节点，loop 外执行。 |
| "用例可能错了" | FAIL，不跳过。修用例需走 increment；本会话内只能修实现或环境。 |
