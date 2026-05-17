# Feature 完整性自检协议

供 init Step 5.4 严格执行。完成 features[] 抽取（5.2）+ check_configs 生成（5.3）后，主 agent 按本协议做 inline 自检；任一规则失败 → 自动修复或回到 5.2 重做（不直接 advance）。

## A. SRS 追溯性自检（orphan FR 检测）

**规则**：每条 SRS FR-xxx / NFR-xxx / IFR-xxx 必须**至少出现在一个 feature 的 `srs_trace` 中**。

执行：
1. 从 SRS §4 / §5 / §7 收集全部 FR / NFR / IFR ID
2. 从 features[] 各 `srs_trace` 数组收集已覆盖 ID
3. 差集 = orphan ID 集合
4. orphan 非空 → 修复策略：
   - **可归并**（orphan 属于某个 feature 的范畴）→ 把该 ID 追加到合适 feature 的 srs_trace
   - **遗漏新 feature**（orphan 描述独立业务能力）→ 新增 feature 含该 ID
   - **应转 EXC**（orphan 在 SRS §9 Out-of-Scope 显式排除）→ 跳过

orphan 非空且无可归并目标 → 主 agent AskUserQuestion 让用户决定。

## B. feature 字段完整性自检

逐 feature 检查：

| 字段 | 规则 |
|---|---|
| `id` | 全局唯一；建议数字递增 1, 2, 3... |
| `status` | 初始一律 `"failing"` |
| `dependencies` | 数组类型；仅引用本批次内已存在 id；不得跨 loop 迭代引用 |
| `title` | 非空字符串 |
| `description` | 非空字符串；≤200 字 |
| `priority` | enum: `high` / `medium` / `low` |
| `srs_trace` | 数组非空；每元素格式 `^(FR|NFR|IFR)-\d{3}$` |
| `category` | enum: `core` / `ui` / `api` / `infra` |
| `wave` | 数字；与根 `waves[].id` 关联 |
| `ui` | boolean |
| `ui_entry` | 仅当 `ui=true` 时非空；否则可省略 |

任一规则失败 → 主 agent 自动修复；无法自动修复 → 回到 5.2。

## C. 依赖环检测（cycle detection）

**规则**：features[] 的 `dependencies` 图必须是 DAG（有向无环图）。

执行：
1. 构造邻接表 `adj[id] = dependencies`
2. 拓扑排序（Kahn 算法或 DFS）
3. 若拓扑排序失败 → 存在环 → 主 agent 输出环路径（如 `[3 → 5 → 7 → 3]`），AskUserQuestion 让用户拆解（删除某条依赖 / 合并循环节点）

## D. wave 拓扑一致性自检

**规则**：feature.wave 与其 dependencies 的 wave 必须满足：`feature.wave > max(dep.wave for dep in feature.dependencies)`，或 `feature.wave == 0` 且 dependencies 为空。

执行：
1. 对每 feature 检查上述约束
2. 不一致 → 主 agent 重新拓扑分波（参考 references/feature-decomposition.md 拓扑分波规则）

## E. waves 深度上限自检

**规则**：waves 最大 id ≤ 3（即最深 4 个 wave: 0, 1, 2, 3）。

执行：
1. `max_wave = max(wave.id for wave in waves)`
2. `max_wave > 3` → 警告：依赖链过深，可能需要重新拆分 features 减少串行约束
3. 主 agent AskUserQuestion 决定保留 / 调整

## F. long-task-guide.md 11 节自检

**规则**：long-task-guide.md 必须含以下 11 节，标题精确匹配：

1. `## Orient`
2. `## Bootstrap`
3. `## Config Gate`
4. `## TDD Red`
5. `## TDD Green`
6. `## Coverage Gate`
7. `## TDD Refactor`
8. `## Verification Enforcement`
9. `## Inline Compliance Check`
10. `## Persist`
11. `## Critical Rules`

任一缺失 → 主 agent 补齐缺失节；不可省略。

## G. UI feature 视觉断言自检

**规则**：每个 `ui: true` 的 feature 必须至少含 1 条带 `[devtools]` 前缀的 verification_step，断言**正面视觉存在**（例如 `[devtools] 用户登录后页面显示欢迎语「Welcome, <name>」`）。

执行：
1. 遍历 `ui: true` features
2. 检查 verification_steps 是否含 `[devtools]` 前缀步骤
3. 缺失 → 主 agent 补齐（参考 SRS AC 与 Design UI 路由）

## H. 前端-后端依赖一致性自检

**规则**：`category == "ui"` 的 feature 必须在 dependencies 中**至少包含一个 `category == "api"` 或 `category == "core"` 的 feature**（除非该 UI feature 纯前端无后端依赖，需在 description 显式声明）。

执行：
1. 遍历 ui features
2. 检查 dependencies 中是否含 api/core feature
3. 缺失 → 提示用户：UI feature #N 似乎无后端依赖，确认是纯前端 feature 吗？AskUserQuestion 决定。

## I. required_configs 完整性自检

**规则**：每个 `required_configs[]` 项必须：

- `name` / `type` 非空；`type` ∈ {`env`, `file`}
- 若 `type == "env"`：`key` 非空（环境变量名，UPPER_SNAKE_CASE）
- 若 `type == "file"`：`path` 非空（相对项目根的路径）
- `description` 非空；`required_by` 数组非空且 ID 在 features[] 中存在
- `check_hint` 非空

任一失败 → 主 agent 修复。

## J. check_configs.py 可执行自检

**规则**：执行 `python check_configs.py --feature 1`（或对应任意 id）应：

- Exit 0：所有该 feature 必需 config 已设置（dev 环境通常空 env，预期 Exit 1）
- Exit 1：缺失 config；stderr 列出缺失项的 name + check_hint

执行 `python -c "import check_configs"` 或 `python check_configs.py --help`，确认语法正确。失败 → 主 agent 修复脚本。

## K. tech_stack 一致性自检

**规则**：根 `tech_stack.language` 必须与 `init.sh` / `init.ps1` 的运行时安装版本一致。

执行：grep `init.sh` / `init.ps1` 中运行时版本，与 `tech_stack.language` + Design §1.4 比对。

不一致 → 主 agent 修脚本或修 tech_stack 字段。

## 自检通过条件

A–K 全部通过 → 进入 Step 5.5（{{TASKS_SET}} 灌入）。

任一关卡失败且不可自动修复 → 回到 Step 5.2 重新抽取 features 或 AskUserQuestion 让用户决策。**不要**在自检未通过时直接 advance（gate_init 硬门也会拦截，但 inline 自检失败应当本节点内 resolve）。
