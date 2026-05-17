---
name: refactor
description: "当 gate_static 通过后由 DAG 推进到本节点时使用 — TDD Refactor 阶段：保持测试为绿的同时清理代码；重新核对设计 §4/§6/§8 对齐"
---

**语言规则**：用中文（简体）回复用户。所有生成的文档、报告和面向用户的输出用中文。Skill 名称、代码标识符、JSON 字段名保持英文。

# TDD Refactor — 清理

保持测试为绿的同时清理代码。本步骤**不引入新功能**。

## 获取当前任务

```bash
{{TASK_GET}}
```

输出 JSON，解析 `task.id` / 其他业务字段。loop 引擎已挑好当前任务，无需手动管理任务状态。

## 输入解析

按当前任务字段读以下文档（`<id>` = `{{TASK_GET}}` 的 `task.id`）：

1. 特性设计：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md` §4 / §6 / §8（与 Green 独立重读，**一致性优先于去重**）
2. 环境指南：`{{HARNESS_MEMORY_DIR}}/notes/env-guide.md` §3（静态分析命令列表）

特性测试文件与实现文件（`feature_test_files` / `impl_files`）由上游 red/green 节点产出，记录在它们的 envelope `next_step_input` 中。

## 重构规则

- 抽取重复、改进命名、简化分支结构
- 每次改动按 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §3` 静默执行，**仅**重跑触及改动文件的测试
- 重构全部完成后跑一次全量套件，确认无回归
- **不新增功能**；新增功能应回到 Red 写新测试驱动

## 设计对齐回查（强制，静态分析之前）

1. 独立重读 `{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md` §4 Interface Contract / §6 Implementation Summary / §8 Data Model
2. 列出本次重构改动的**公共符号**：
   - 新增或重命名的方法
   - 改动的参数类型 / 异常类型
   - 跨模块移动的函数
   - 新增或调整的数据字段
3. 对每个改动符号，核对是否仍与 §4 / §6 / §8 对应行字面一致
4. **UML 图合规**（若特性设计文档含 mermaid 图）：
   - `classDiagram`：grep 每个节点名 → 确认类存在；`MODIFIED` 节点 → `git diff` 确认有变更；**未在类图中声明但被修改的类** → 范围蔓延告警
   - `sequenceDiagram`：grep 每条消息的方法名 → 确认在对应类中实现且被调用
   - `stateDiagram-v2`：grep 每个状态名 + 事件名 → 确认出现在代码中
   - `flowchart TD`：AST / grep 每个决策条件 → 确认实现含对应分支；**未在图中声明但存在的额外分支** → 告警
   - 任一告警 → drift-protocol（更新图 OR 回滚改动，同一 commit）
5. 不一致 → 按 `{{SHARE-REFERENCE}}/drift-protocol.md` 处理：
   - 偏离合理 → 更新对应设计节（含 mermaid 图）+ 复查 §7 Test Inventory + 设计与代码**同一 commit**
   - 偏离不合理 → **回滚重构**
   - 无法本地消解 → `bp-advance blocked --notes='[CONTRACT-DEVIATION]'`
6. **设计对齐未通过不得进入静态分析**（偏离符号被静态工具忽略将导致后续 Inline Check P2/D3 拦截）

## 静态分析关卡

若 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §3` 列出静态分析命令（Checkstyle / Ruff / Pylint / ESLint / cppcheck 等）：

1. 设计对齐通过且重构全部完成后，按 `{{HARNESS_MEMORY_DIR}}/notes/env-guide.md §3` 静默执行每个工具
2. 退出码非零 → `grep -E "error|warning" /tmp/static-$$.log` 提取违规
3. **退出重构之前修复全部违规** —— 违规是阻塞性的
4. 工具自行读取配置（`.pylintrc` / `checkstyle.xml` / `eslint.config.js` 等）；**不要**手动解析配置

若 env-guide §3 未列静态分析 → 本关卡 N/A，跳过。

> 注：harness 在本节点结束后会自动跑 `gate_static.cjs` 硬门做静态分析阈值机器校验；本步骤是 LLM 自检层 + 修复阶段。

## 阻塞 / 失败

- 重构引入回归且无法修复 → `bp-advance failed`
- 静态分析违规无法修复 → `bp-advance failed`
- 设计偏离无法本地消解 → `bp-advance blocked --notes='[CONTRACT-DEVIATION]'`
- 静态工具 / 环境故障 → `bp-advance blocked --notes='[ENV-ERROR]'`
