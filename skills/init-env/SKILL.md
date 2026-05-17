---
name: init-env
description: "Use when dispatched by init Step 3 — generate env-guide.md (six sections) from env-guide-template.md + design doc + notes/rules/, with §3/§4 approval semantics"
---

# 生成 env-guide.md

为项目创建环境契约的**单一事实源**（六节，用户可编辑，§3 / §4 受人类审批关卡保护）。

## 步骤

1. 读 `references/env-guide-template.md` 作为骨架
2. 读 `{{HARNESS_MEMORY_DIR}}/plans/design.md`：服务端口、健康检查 URL、服务名、技术栈、build/test/coverage 工具链
3. 读 `{{HARNESS_MEMORY_DIR}}/plans/srs.md`：接口需求（IFR-xxx）的外部依赖（数据库、消息队列、三方服务）
4. 读 `{{HARNESS_MEMORY_DIR}}/notes/rules/`（若存在，含 `coding-constraints.md` / `build-and-compilation.md` 等）：存量代码库约束；若目录不存在或仅含占位，greenfield 处理
5. 按以下规则填六节并写到 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md`：

**Frontmatter**（首次生成豁免）：
```yaml
---
version: 1.0
approved_by: null
approved_date: null
approved_sections: []
---
```

**§1 服务生命周期**：
- Services 表列：Service Name / Port / Start Command / Stop Command / Verify URL
- Start All Services 段：每服务一条带输出捕获的命令（Unix + Windows 双版本），含 `sleep 3` + `head -30` 日志 tail
- Verify Services Running：`curl -f http://localhost:<port>/health`
- Stop All Services：`kill <PID>` + 端口兜底 `lsof -ti :<port> | xargs kill -9`
- Verify Services Stopped：`lsof -i :<port>` 期望空
- 4 步重启协议（Kill → Verify dead → Start + capture → Verify alive）
- 复杂启动（>2 shell 步）→ 抽出到 `{{SCRIPTS}}/svc-<slug>-start.sh` 并引用
- CLI-only / library-only → 写 "No server processes — environment activation only"

**§2 环境配置**：
- 环境激活命令（如 `source .venv/bin/activate`、`conda activate <env>`）
- 必需环境变量 → 引用 `.env.example`
- 配置加载 → 引用 `check_configs.py`（由 init-features 在 Step 5 生成到项目根；本步骤仅在 §2 写入引用占位）

**§3 构建与执行命令**（下游 TDD / Quality / Feature-ST 直读）：
- 所有命令使用静默执行模板：`<cmd> > /tmp/<tag>-$$.log 2>&1; echo $? > /tmp/<tag>-$$.exit`
- 覆盖 Build / Unit tests / Coverage / Static analysis（仅当 `{{HARNESS_MEMORY_DIR}}/notes/rules/coding-constraints.md` 含 Static Analysis Tools 表）
- 工具版本锁条目（例如 Python ≥ 3.11、Node ≥ 20）
- Re-check 协议：任何失败 → 修复后按名字重跑失败项，永不全量重跑
- 工具/环境故障 Fallback 段落（boilerplate 原样写入）：诊断 → `init.sh` 或按 §1 启服务 → 重试一次 → 仍失败 `status: blocked` 前缀 `[ENV-ERROR]`

**§4 存量代码库约束**（直接从 `{{HARNESS_MEMORY_DIR}}/notes/rules/` 提取）：
- §4.1 强制内部库 ← `{{HARNESS_MEMORY_DIR}}/notes/rules/coding-constraints.md` 的 "Mandatory Internal Libraries" 表
- §4.2 禁用 API ← `{{HARNESS_MEMORY_DIR}}/notes/rules/coding-constraints.md` 的 "Prohibited APIs / Libraries" 表
- §4.3 代码样式基线 ← `{{HARNESS_MEMORY_DIR}}/notes/rules/coding-style.md`
- §4.4 构建系统约定 ← `{{HARNESS_MEMORY_DIR}}/notes/rules/build-and-compilation.md`
- Static Analysis Tools 表的命令行进 §3，**不进 §4**
- greenfield（无 `{{HARNESS_MEMORY_DIR}}/notes/rules/` 或仅占位）→ 各表写 "_(empty — greenfield project)_"

**§5 测试环境依赖**：
- 数据库、消息队列、2/3方件 服务本地副本配置
- Chrome DevTools MCP 启动命令（仅当项目有 UI 特性）
- WireMock / MockServer / testcontainers 设置（如适用）

**§6 人类审批记录**：
- 从模板复制工作流描述
- 历史表（Date / Version / Approved By / Change Summary）预填一行初次生成记录（Approved By 留 `null`）

6. 完成后 inline 自检（蓝图无 validate 脚本，由 SubAgent 自己核对）：
   - §1-§6 段标题齐全
   - §1 每 service 含 Start/Stop/Verify 三命令
   - §2 含环境激活命令 + `.env.example` 引用
   - §3 至少含 build_cmd + test_cmd
   - §4 各小节齐全（greenfield 写占位）
   - 任一缺失 → `status: fail`，evidence 列出具体缺失项

## 返回

```markdown
## SubAgent Result: init-env

**status**: pass | fail | blocked
**artifacts_written**: ["{{HARNESS_MEMORY_DIR}}/notes/env-guide.md"]
**next_step_input**: {
  "services": [{"name": "...", "port": 8080, "start_cmd": "...", "verify_url": "..."}],
  "env_activation_cmd": "source .venv/bin/activate",
  "build_cmd": "...",
  "test_cmd": "...",
  "coverage_cmd": "...",
  "static_analysis_cmd": null,
  "tool_version_pins": {"python": ">=3.11", "pytest": ">=8.0"},
  "rules_source_files": ["{{HARNESS_MEMORY_DIR}}/notes/rules/coding-constraints.md", "{{HARNESS_MEMORY_DIR}}/notes/rules/coding-style.md"],
  "ui_detected": false,
  "greenfield": false
}
**blockers**: []
**evidence**: [
  "env-guide.md §1-§6 populated from template + design + rules",
  "inline check: §1-§6 all present, every service has Start/Stop/Verify, §3 has build_cmd+test_cmd, §4 sections populated",
  "Rules extracted from N files; Static Analysis tool: <name> → routed to §3"
]
```

## 阻塞 / 失败

- `references/env-guide-template.md` 缺失 → `fail`，evidence 附路径
- `{{HARNESS_MEMORY_DIR}}/plans/design.md` 中服务端口/健康 URL 格式无法解析 → `blocked`，blocker 指明缺失字段
- user 声称 brownfield 但 `{{HARNESS_MEMORY_DIR}}/notes/rules/` 完全为空 → `blocked`，blockers 含 `["missing-rules-coding-constraints"]`
- inline 自检（步骤 6）失败 → `fail`，evidence 附缺失项列表；`artifacts_written` 仍列出 env-guide.md（主 agent 可据此 Failure Addendum 返工）

## 反模式

| Anti-Pattern | Correct |
|---|---|
| 修改 frontmatter `approved_by` / `approved_date` / `approved_sections` | 这些字段只由主 agent 在审批关卡后写入；sub-skill 只输出内容 |
| 把 Static Analysis 命令写进 §4.1 / §4.2 | Static Analysis 命令行进 §3（工具由下游直接运行） |
| 删除 §4 子节给 greenfield 项目 | 保留全部 §4.1–§4.4 小节并在各表写占位 "_(empty — greenfield project)_" |
| 把服务 Start/Stop 命令内嵌在多行 shell 脚本里 | >2 行 → 抽到 `scripts/svc-<slug>-start.sh` 并由 §1 引用 |
| 省略 Windows 平行命令 | `§1 Start/Verify/Stop` 必须同时给 Unix + Windows 版本 |
