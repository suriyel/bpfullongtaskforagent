---
name: green
description: "当 red 完成后由 DAG 推进到本节点时使用 — TDD Green 阶段：最小化实现，严格对齐特性设计 §4/§6/§8（接口契约 / 实现摘要 / 数据模型）+ 服从 env-guide §4 codebase constraints + 服务进程输出启动信息"
---

**语言规则**：用中文（简体）回复用户。所有生成的文档、报告和面向用户的输出用中文。Skill 名称、代码标识符、JSON 字段名保持英文。

# TDD Green — 最小化实现

只写**刚好**能让测试通过的代码。

## 获取当前任务

```bash
{{TASK_GET}}
```

输出 JSON，解析 `task.id` / `task.title` / `task.description` / `task.tech_stack` / 其他业务字段。loop 引擎已挑好当前任务，无需手动管理任务状态。

## 输入解析

按当前任务字段读以下文档（`<id>` = `{{TASK_GET}}` 的 `task.id`）：

1. 特性设计：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md` 全文；**§4 Interface Contract、§6 Implementation Summary、§8 Data Model 必读**
2. 任务 tech_stack / quality_gates / required_configs：直接读 `{{TASK_GET}}` 输出 JSON 中对应字段（loop 引擎从 `tasksSchemas.default` 灌入）
3. 环境指南：`{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §2（激活）+ §3（测试命令）+ §4（codebase constraints）

特性测试文件（`feature_test_files`）由上游 red 节点写好，记录在 red 节点上报的 envelope `next_step_input`；本节点不重新生成或修改测试（除非走 drift-protocol 更新设计同步测试断言）。

## 设计对齐前置（强制，写任何实现代码前）

本阶段独立重读 `{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md`——**一致性优先于去重**：

- **§4 Interface Contract**：每个 PUBLIC 方法的签名（名 / 参数名与类型 / 返回类型 / 抛出异常）
- **§6 Implementation Summary**：模块职责表 + 调用链散文
- **§8 Data Model**：数据结构字段与类型
- **mermaid 图**（若设计按 feature-design-execution §2a 触发嵌入）—— **严格遵从**：
  - `classDiagram`：每个 `classDef NEW` 节点 → 创建类；`classDef MODIFIED` 节点 → 修改现有类；关联 / 依赖边 → 字段引用或方法参数
  - `sequenceDiagram`：消息顺序 = 实现中方法调用的先后顺序，**不得**乱序
  - `stateDiagram-v2`：状态转移表 = 实现骨架（如 `switch` / `match` on `(state, event)`）；每个 transition 与守卫在代码中可定位
  - `flowchart TD`：决策菱形 = `if` / `elif` 结构骨架；错误终点 = `raise` 语句；分支条件文本 = 条件表达式语义

## 实现端一致性铁律

- 公共方法名 / 参数 / 返回类型 / 异常类型 **必须与 §4 字面一致**
- 模块划分 / 调用链 **必须与 §6 一致**
- 数据结构字段名 / 类型 / 可空性 **必须与 §8 一致**
- 若设计含 mermaid 图：类节点命名 / 消息顺序 / 状态转换事件名 / 分支条件文本 **必须与图字面一致**（未在图中声明但实现的额外类 / 消息 / 状态 / 分支 = 范围蔓延，需走 drift-protocol 同步回图）
- 发现无法字面对齐（设计有歧义 / 实现方式客观更优）→ **不偷偷偏离**，按 `{{SHARE-REFERENCE}}/drift-protocol.md` 走（更新设计 OR 修实现，同一 commit）；无法本地消解 → `bp-advance blocked --notes='[CONTRACT-DEVIATION]'`

## 最小实现规则

- 基于 red 节点产出的特性测试文件从零实现 —— 绝不参考任何"被删除"的前置实现
- 一次一个测试：先让最简单的失败测试通过，再处理下一个
- 无过早优化或额外特性
- **存量代码库约束**（若 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §4` 存在）：
  - **§4.1** 使用强制内部库 —— **不要**使用被替换的标准 / 三方 API
  - **§4.2** 不得使用禁用 API
  - **§4.3** 遵循既定命名与错误处理模式

## 启动输出要求

对任何实现服务器进程或后台服务的特性，实现必须在启动时输出：

- **绑定端口**：`Starting server on port 8080`
- **PID**：`PID: 12345`
- **就绪信号**：`Server ready`

> Red 阶段应已有对应测试断言；若 Red 漏写 → drift-protocol 走"更新 §7 Test Inventory + 补测试 + 同一 commit"。

## env-guide.md 同步规则

实现或修改服务器 / 后台服务后：

1. 对比实际启动命令与绑定端口 vs `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` "Start All Services" 段 + Services 表
2. 若不一致（端口变、命令改名、新增服务）：更新 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` —— 修 Services 表行 + Start/Stop/Verify 命令
3. 若启动顺序需要 >2 条 shell 命令（如 DB migration + seed + server）：抽取到 `scripts/svc-<slug>-start.sh`（Unix）/ `scripts/svc-<slug>-start.ps1`（Windows）；env-guide 的 "Start All Services" 改为 `bash scripts/svc-<slug>-start.sh`；停止同理
4. 所有 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` + `scripts/svc-*` 的变更与实现放在**同一次 git 提交**

## 运行测试

按 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §3` 静默执行。**本阶段 exit = 0 是预期**；exit != 0 意味着实现有问题，提取最后 100 行日志诊断。

修复后**只重跑触及的测试**，不跑全套；最终再跑一次全量确认无回归。

## 测试全绿后自检

列出本次实现的所有公共方法签名 / 参数类型 / 异常类型 / 数据结构字段，逐条核对 §4 / §6 / §8：

| 对象 | 设计节 | 字面一致？ |
|-----|-------|----------|
| `login(username: str, password: str) -> Token` | §4 | ✅ / ❌ |
| 模块调用链 `router → AuthService → UserRepo` | §6 | ✅ / ❌ |
| `User(id, email, created_at)` 字段类型 | §8 | ✅ / ❌ |

任何 ❌ → drift-protocol；无法本地消解 → bp-advance blocked。

## 阻塞 / 失败

- 3 次实现仍无法让测试通过 → `bp-advance failed`
- 设计与实现不一致且方向判据无法本地决策 → `bp-advance blocked --notes='[CONTRACT-DEVIATION]'`
- 外部依赖缺失（数据库宕、API 凭据缺）→ `bp-advance blocked --notes='[ENV-ERROR]'`
- 规约歧义在无用户输入时无法解决 → `bp-advance blocked --notes='[SRS-VAGUE]'` / `'[SRS-DESIGN-CONFLICT]'` / `'[SRS-MISSING]'`
