# Init 节点执行细则（init-env SubAgent 派发协议）

> 历史：本文件曾承载三个 SubAgent 派发规约（init-env / init-bootstrap / init-features）+ 双闸门审批 + Step 6-10 执行步骤。init-bootstrap / init-features 已合并入主 SKILL.md（Step 4 / 5）；本文件仅保留 init-env SubAgent 派发协议。Step 6-10 执行细则在主 SKILL.md 内联。

---

## § init-env SubAgent 派发

主 agent 在生成 `{{HARNESS_MEMORY_DIR}}/plans/project-context.md` 骨架并完成基本资产复制之后，按 init 主 SKILL.md Step 3 派出 init-env SubAgent 生成 env-guide.md。该 SubAgent 使用 Claude Agent 工具（General / Agent）独立上下文加载并执行 sub-skill，主 agent 只持有 orchestration + 用户交互职责，不读 env-guide.md 全文。

### 派发签名

> **{{AGENT}} 分发独立 SubAgent** — 在 subagent 中加载并执行 sub-skill `init-env` 的业务逻辑。
> **input**: `project_lang`（来自任务结构 `tech_stack.language` 字段）。
> **expect**: Structured Return Contract；`artifacts_written=["env-guide.md"]`；`next_step_input` 含 `services[]` / `env_activation_cmd` / `build_cmd` / `test_cmd` / `coverage_cmd` / `tool_version_pins` / `ui_detected`。

### env-guide.md 六节结构（SubAgent 内部生成）

| 节 | 内容 |
|---|---|
| **§1 服务生命周期** | Services 表 + Start All / Verify / Stop All / Verify Stopped + 4 步重启协议（双平台 Unix + Windows）。复杂启动（>2 shell 步）抽出到 `scripts/svc-<slug>-start.sh` 并引用。|
| **§2 环境配置** | 环境激活命令、必需环境变量、配置加载（引用 `.env.example` 与项目根 `check_configs.py`）。|
| **§3 构建与执行命令** | Build / Unit tests / Coverage / Static analysis 全部按静默执行模板 `<cmd> > /tmp/<tag>-$$.log 2>&1; echo $? > /tmp/<tag>-$$.exit`。含工具版本锁与 Re-check 协议（永不全量重跑）+ 工具 / 环境故障 Fallback（诊断 → init.sh / §1 → 重试一次 → 仍失败 `[ENV-ERROR]` 前缀 blocked）。|
| **§4 存量代码库约束** | §4.1 强制内部库、§4.2 禁用 API、§4.3 代码样式基线、§4.4 构建系统约定。直接从 `{{HARNESS_MEMORY_DIR}}/notes/rules/*.md` 提取；Static Analysis 命令进 §3 不进 §4；greenfield 写 `_(empty — greenfield project)_` 占位但保留所有子节。|
| **§5 测试环境依赖** | DB / 消息队列 / 三方件本地副本配置，Chrome DevTools MCP 启动命令（仅 UI 项目），WireMock / MockServer / testcontainers 设置。|
| **§6 人类审批记录** | 历史表（Date / Version / Approved By / Change Summary），初次生成预填一行，Approved By 留 `null` 待主 agent 写入。|

Frontmatter（首次生成豁免）：

```yaml
---
version: 1.0
approved_by: null
approved_date: null
approved_sections: []
---
```

### env-guide 审批（§3/§4 合并审批）

按"审批-返工循环"通用规则处理 init-env SubAgent 的返回：

- **§3 与 §4 合并在同一关卡审批** — approve 时主 agent 更新 env-guide.md frontmatter `approved_by` / `approved_date` / `approved_sections: ["§3", "§4"]`（**主 agent 写**，sub-skill 永不修改这三个字段）
- approve / revise / escalate 三态，2 轮封顶；revise 时主 agent 用 Failure Addendum 组装新输入重发 SubAgent
- §3 漂移（Static Analysis 错置 §4 / 命令格式不符静默模板）→ revise
- §4 内部库 / 禁用 API 与 `{{HARNESS_MEMORY_DIR}}/notes/rules/` 不一致 → revise
- 模板缺失（init-env sub-skill 自身 `references/env-guide-template.md`）→ SubAgent 返回 `fail`，主 agent escalate
- user 声称 brownfield 但 rules 完全为空 → SubAgent 返回 `blocked` with `["missing-docs-rules-coding-constraints"]`，主 agent 用 AskUserQuestion 后再决策

---

## § 关键规则（节点级硬约束）

- **Step 3 init-env SubAgent 边界**：主 agent 不读 env-guide.md 全文；只按 evidence + next_step_input 做决策
- **env-guide.md frontmatter 审批字段由主 agent 写**：sub-skill 永不修改 `approved_by` / `approved_date` / `approved_sections`
- **每步 sub-skill 返回都走审批-返工循环**：approve / revise / escalate 闸门；2 轮封顶
- **Step 4 / 5 不再 DISPATCH**：主 agent 内联执行；详细流程见主 SKILL.md Step 4 / 5 + `references/init-script-recipes.md` / `references/feature-decomposition.md` / `references/feature-validation.md`
