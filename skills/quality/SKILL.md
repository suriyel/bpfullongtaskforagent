---
name: quality
description: "当 iter loop quality 节点 DISPATCH 时使用 — 在主 agent 内执行 Real Test / SRS Trace / Coverage 三道质量关卡，按 envelope (bp-advance ok/failed/blocked) 上报；蓝图 DAG 节点，refactor 之后、wst 之前。"
---

# Quality Gates — Skill

你是 Quality Gates 执行节点。严格遵循以下规则。完成后，按 framework 自动注入的 end-of-task protocol 用 `bp-advance ok/failed/blocked` 上报；本节点是蓝图 DAG 节点（kind: skill），不返 Structured Return Contract（loop 引擎按 envelope 推进）。

---

# Quality Gates & Verification（关卡与验证）

三道顺序关卡（Gate 0 → 0.5 → 1），在特性被标记为 "passing" 之前**必须**全部通过。无捷径，无例外。原 Gate 2（Verify & Mark）的 fresh-execution 与 cross-check 语义已并入 Gate 1（Coverage & Final Verify），不再独立列出。

## 铁律

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

若本条消息中未运行验证命令，则不得声称它通过。


**工具 / 环境错误处理**：
1. **读取**错误输出 — 识别具体的工具或环境问题
2. **诊断**根因（工具未安装、环境未激活、路径错误、配置缺失）
3. **尝试修复** — 必要时运行 `init.sh`，或安装缺失工具
4. **重跑**一次
5. **若仍失败** → 将 Verdict 设为 BLOCKED，附错误详情
6. **绝不跳过** — 测试是硬关卡；不允许绕过

## Gate 0：真实测试验证（Real Test Verification）

Gate 0 在 coverage 之前运行。当测试套件全是 mock 时，覆盖率数字毫无意义。

### Step 1：内联识别真实测试

读 `{{TASK_GET}}` 拿当前 task（含 `srs_trace` / `required_configs` 等字段）。对 task 涉及的测试文件做以下检查（蓝图无对应辅助脚本，主 agent 直接执行）：

1. **真实测试发现**：grep / find 测试文件中的 marker：函数名 / 文件名含 `real_` / `_real` / `it_real` / `test_real_*` 前缀，或测试体注释含 `# real-test` / `// real-test` 等约定 marker
2. **Mock 警告扫描**：grep 测试文件中 `mock` / `Mock` / `patch(` / `stub` / `sinon.stub` 等关键字，记录每条命中行号
3. **依赖强制判定**：若 `task.required_configs[]` 含连接串类键（URL / URI / DSN / HOST / PORT / CONNECTION / ENDPOINT），真实测试**强制**——纯函数豁免被阻止

判定：
- **FAIL**（无真实测试） → GATE 0 FAIL，返回 TDD Red 撰写真实测试
- **FAIL** 且 task 有外部依赖 → 见下文 Step 1b
- **WARN**（发现 mock 警告） → 进入 Step 2
- **PASS**（发现真实测试，无 mock 警告） → 进入 Step 3

### Step 1b：依赖阻塞 FAIL 的处理

若 Gate 0 FAIL 原因含"task 有外部依赖但无真实测试"：
1. 这**不是**代码问题 — 是基础设施 / 配置问题
2. **内联检查配置**：对 `task.required_configs[]` 每一项，读 `.env` / 项目 config 文件验证存在性（env 类型查 `os.environ` 或 `process.env`；file 类型用 Read 验证路径）
3. 若配置缺失 → 用 `{{ADVANCE_BLOCKED notes="[ENV-ERROR] Feature #{task.id} requires external dependencies ({config_names}) but configs are not provided"}}` 上报；先用 AskUserQuestion 收集缺失值
4. 若配置齐备但服务未运行 → 读 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md`，启动服务，重跑 Gate 0
5. 对有外部依赖的特性**绝不**无真实测试就继续
6. 对含连接串 `required_configs[]` 的特性**绝不**声称纯函数豁免

### Step 2：LLM 采样评审（仅 WARN）

对脚本标记的每条 mock 警告：
1. 阅读对应真实测试函数体
2. 判断：mock 是否针对该真实测试声称要验证的**主要依赖**？
   - 是 → 真实测试无效；重写、重跑脚本
   - 否（mock 在某个不相关的辅助服务上） → 视为合法，继续

### Step 3：运行真实测试（含 skip 检测）

使用 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §3 的运行命令单独执行真实测试：
- 所有真实测试**必须通过**
- 任何 FAIL → GATE 0 FAIL，修复后重跑
- **Skip 检测（强制）**：读取测试 runner 的完整输出。若**任一**真实测试被报告为 `skipped`、`pending`、`disabled` 或 `ignored` — 视为 GATE 0 FAIL。真实测试必须执行，不得跳过。
  - 常见 skip 标志：pytest `s` 标记或 "skipped" 计数 > 0；JUnit `@Disabled`；Jest/Vitest "skipped"/"pending" 计数 > 0；gtest "DISABLED_" 前缀
  - 若 skip 源于基础设施缺失 → 服务 / DB 未运行。阅读 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md`，启动服务，重跑。
  - 若 skip 源于环境 guard（`if not env: return`） → 改写测试为断言失败（反模式 #16）。真实测试必须高声失败，不得静默通过。

### 所需证据
```
Gate 0 Result:
- Real test discovery: N real tests found (markers: real_* / _real_ / test_real_*)
- Mock warning review: [for each warning — primary dep / auxiliary service]
- Real test execution: passed N / failed N / skipped N
- Skip verdict: 0 skipped (or: N skipped → FAIL, reason and fix applied)
- Gate 0: PASS/FAIL
```

### Gate 0 FAIL 时
```
GATE 0 FAIL — [reason]
Required action:
1. [Fix missing real tests / rewrite mock-using real tests / set up test infrastructure]
2. Re-run TDD Red verification (real tests must FAIL first, then PASS after Green)
3. Return to Gate 0
Do NOT skip Gate 0 and proceed to coverage.
```

## Gate 0.5：SRS Trace Coverage（需求追溯）

**动机**：覆盖率 100% 不等于"需求被测试锚定"。SRS 验收准则若在迭代中修改而测试未同步补齐，单看覆盖率会静默放行。本关卡强制每个 `srs_trace` 中的需求 ID 都在本 feature 的测试工件（文件名 / 函数名 / docstring / 注释 / 断言字符串）中字面出现。

### Step 1：内联检查 FR-ID 字面引用

读 `{{TASK_GET}}` 拿 task.srs_trace 列表 + TDD 阶段写入的测试文件清单（来自 task-progress.md 或 git diff 推导）。

对 task.srs_trace 中每个 FR-ID 做字面 grep（hyphen↔underscore 等价：`FR-001` 匹配 `test_fr_001_*` / `fr_001` / `FR_001` / `FR-001`）：

```bash
# 示例：对每个 fr_id，跨测试文件清单做字面 grep
for fr in <srs_trace_ids>; do
  variants="$fr|$(echo $fr | tr '-' '_')|$(echo $fr | tr '_' '-')"
  grep -rE "$variants" <test_files> | head -1 || echo "UNCOVERED: $fr"
done
```

- 命中需出现在测试文件的：文件名 / 函数名 / docstring / 注释 / 断言字符串中
- 若 task 含 `srs_trace_aliases` 字段（如 `{ "FR-001": ["@srs-login", "legacy-login-id"] }`），把别名加入 variants

### Step 2：判定结果

| 情况 | 动作 |
|------|------|
| 全部 `srs_trace` ID 均有字面命中 | Gate 0.5 PASS，进入 Gate 1 |
| 至少 1 个 ID 未命中 | Gate 0.5 FAIL；记录 `uncovered_fr_ids` 列表 → 上报 `{{ADVANCE_FAIL notes="[SRS-TRACE-MISS] uncovered=..."}}` |
| 输入错误（task 中无 srs_trace / 测试文件不存在）| 上报 `{{ADVANCE_BLOCKED notes="[INPUT-ERROR] ..."}}` |

### Step 3：FAIL 处理

Gate 0.5 FAIL 不回到 TDD Red —— 已有测试在运行，只是**没有锚定 FR-ID**。动作顺序：

1. 读 uncovered_fr_ids 列表；
2. 在现有测试里为每个未覆盖 ID 追加字面引用（推荐：写入最相关 test 的 docstring 或注释；或重命名函数为 `test_fr_001_*` 形式）；
3. 重跑 Step 1 字面 grep；
4. 若 3 次重试仍 FAIL（例如 `srs_trace` 与本 task 实际测试范围不匹配），`{{ADVANCE_FAIL notes="[SRS-TRACE-MISS] uncovered=[...]"}}` 上报；loop 引擎按 onFail.rewindTo=green 回卷由 green 节点扩测或要求用户修订 `srs_trace`。

### Step 4：豁免

task 的 `srs_trace` 为空时，标记"no srs_trace declared"，Gate 0.5 自动 PASS。这对应 `category=bugfix` 尚未完成根因追溯或 srs_trace 尚未回填的早期状态。上游 init / wd 节点应另有断路（不允许空 `srs_trace` 进入 quality），此关卡不承担该职责。

### 所需证据

```
Gate 0.5 Result:
- srs_trace count: N (from {{TASK_GET}}.srs_trace)
- Uncovered IDs: [FR-xxx, ...] (empty if PASS)
- Gate 0.5: PASS/FAIL
```

## Gate 1：Coverage & Final Verify（覆盖率与最终验证）

TDD Green 之后（全部测试通过），运行覆盖率工具并完成最终验证。**本关卡是 Quality SubAgent 的最后一道**——原 Gate 2（Verify & Mark）的 fresh-execution 与 cross-check 语义已并入此处，**不再独立复跑命令**。

### Fresh Execution Requirement（新鲜执行约束）

覆盖率命令**必须**在当前节点 message 内执行：
- 不得引用 refactor / green 节点末尾跑过的全量结果——那是**另一个节点的 message**，不算本节点内的 fresh evidence
- 不得复用 `/tmp/cov-*.log` 中的历史日志——每次执行用新的 `$$` PID 后缀
- 不得以"应该通过 / 之前已跑过 / 看着差不多"作为门禁依据（参见本文件"红旗词汇"段）

### 执行步骤

1. **运行**覆盖率工具，采用**静默执行**（按 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §2 激活环境；从 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §3 读取 coverage 命令）：
   ```bash
   <coverage-cmd> > /tmp/cov-$$.log 2>&1; echo $? > /tmp/cov-$$.exit
   ```
2. **先读** `/tmp/cov-$$.exit` 的退出码：
   - exit 0 → 仅提取覆盖率摘要行（通常 `grep -E "TOTAL|Coverage|line rate|branch rate" /tmp/cov-$$.log | tail -5`）。**不要**倾倒完整文件。
   - 非零 → 提取最后 100 行；诊断工具错误
3. **验证**：行覆盖率 >= `[thresholds] line_coverage`，分支覆盖率 >= `[thresholds] branch_coverage`
4. **若覆盖率 FAIL**（低于阈值但工具成功运行）：从摘要识别未覆盖行 / 分支 → 增加测试 → 对这些路径重跑 TDD 循环。修复后重跑时，仅作用域到变更的测试文件 — 不要全量。
5. **若 PASS**：进入 Final Cross-Check（下方）。

### Final Cross-Check（标记 passing 前的最终交叉验证）

上报 `{{ADVANCE_OK}}` 之前，**逐项确认**本消息内已有的覆盖率命令输出同时满足下列三项（命令本身 = test + coverage，无需另跑）：

- (a) **测试结果**：从输出统计 `passed / failed / skipped`；**failed=0 且 skipped=0**（skipped>0 视同 fail，参照 Gate 0 Skip 检测规则）
- (b) **行覆盖率**：line% ≥ `quality_gates.line_coverage_min`（从 `{{VARS_GET}}` 或 `{{HARNESS_MEMORY_DIR}}/plans/project-context.md` 取）
- (c) **分支覆盖率**：branch% ≥ `quality_gates.branch_coverage_min`

任一项不满足 → STOP，**不得**上报 `{{ADVANCE_OK}}`；按上方步骤 4 的 FAIL 路径修复后**重跑覆盖率命令**并重新交叉验证。

### 所需证据

```
- Coverage summary showing line % and branch %
- Line coverage >= threshold
- Branch coverage >= threshold
- Test results: passed=N, failed=0, skipped=0
- List of uncovered lines (if any, with justification)
```

## 红旗词汇

若你发现自己用了下面任一说法，STOP 并重新验证：

| Red Flag | Required Action |
|----------|----------------|
| "should pass" | 现在就运行测试 |
| "probably works" | 现在就执行并验证 |
| "seems to be working" | 取得具体测试输出 |
| "I believe this is correct" | 运行验证命令 |
| "this looks good" | 运行自动化测试 |
| "based on the implementation" | 测试验证行为，而非代码 |
| "the tests should be green" | 运行测试并读取输出 |
| "I've verified"（未展示输出） | 展示实际输出 |
| "coverage is probably fine" | 现在就运行覆盖率工具 |

## 工具配置

若本项目技术栈尚未配置覆盖率工具，阅读 `{{SHARE-REFERENCE}}/coverage-recipes.md` 获取各语言（Python、Java、JavaScript、TypeScript、C、C++）的完整配置说明。

## 验证时机一览

| Event | What to verify |
|-------|---------------|
| Gate 0 (Real Test) | task 测试文件含真实测试 marker；所有真实测试通过；0 skipped |
| Gate 0.5 (SRS Trace) | 每个 `task.srs_trace` ID 至少 1 处在测试文件中字面命中 |
| Gate 1 (Coverage & Final Verify) | 覆盖率报告（line% + branch%）+ 全测试 0 failure 0 skipped + 阈值达标 |
| 上报 envelope 前 | Gate 0 / 0.5 / 1 三者全部 PASS；以 `{{ADVANCE_OK}}` 推进，否则 `{{ADVANCE_FAIL}}` / `{{ADVANCE_BLOCKED}}` |

## 反模式

| Anti-Pattern | Correct Approach |
|---|---|
| 写完代码未跑测试就标记 "passing" | 运行测试、读取输出，再标记 |
| 相信重构未破坏任何东西 | 每次重构后重跑完整套件 |
| 只读测试输出的摘要行 | 阅读完整输出 |
| 会话开始不做复检 | 始终对 passing 特性做冒烟 |
| 跳过 Gate 0，"覆盖率会抓到 mock 问题" | 覆盖率对 mock vs real 无感。Gate 0 始终先跑。 |
| 脚本报 WARN 却不审阅直接继续 | 必须审阅每条 mock 警告判断其是否针对主要依赖。 |

---

## 上报与持久化

本节点是蓝图 DAG 节点（kind: skill），按 framework 自动注入的 end-of-task protocol 上报；**不返回 Structured Return Contract**（loop 引擎按 envelope 推进）。

在 `{{HARNESS_MEMORY_DIR}}/notes/task-progress.md` 当前 task 标题下追加一行（人类可读日志）：

```
- Quality: line=<N>%, branch=<M>%, srs_trace=<C>/<N> covered
```

完成全部 3 道 Gate 后：
- 全部 PASS → `{{ADVANCE_OK}}` 上报，loop 引擎推进到 wst 节点
- Gate 0 / 0.5 FAIL → `{{ADVANCE_FAIL notes="[GATE-X-FAIL] <reason>"}}`，loop 引擎按 onFail.rewindTo=green 回卷
- 工具 / 环境错误 1 次重试后仍失败 → `{{ADVANCE_BLOCKED notes="[ENV-ERROR] <details>"}}`，主 agent 用 AskUserQuestion 升级

**重要**：**不要**在 task-progress.md 中将 task 标记为 "passing" — 那是 loop 引擎按 `doneValues` 自动判定的职责。本节点只产出 quality 数据。
