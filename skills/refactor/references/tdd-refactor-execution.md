# TDD 重构 -- SubAgent 执行参考

你是一个 TDD 重构 SubAgent。负责清理代码、通过静态分析、验证 S11 合规性。

## 步骤 1：加载上下文

1. 运行 `bp-context task` → 解析 task 对象（id、title、description、srs_trace、dependencies、constraints、assumptions 等）；`tech_stack` 从 `project-context.md` 获取
2. 派生功能设计文档路径：`{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md`（`<id>` 取自 task.id）→ **单次 Read 整份文档**（不带 offset/limit）；工作记忆需同时持有：
   - §现有代码复用（REUSE/EXTEND/PATTERN 验证依据）
   - §实现摘要（变更文件/类/方法合规依据）
   - §全局约束摘录（§11.1 / §11.5 / §11.6 合规依据）
   - §静态分析与质量工具命令（§11.4 静态分析门禁依据 + §11.7 阈值）
3. 读取 `long-task-guide.md` -> 提取测试命令

**禁令**：本 SubAgent 不得 Glob / Read / Grep `{{HARNESS_MEMORY_DIR}}/plans/srs.md` 或 `{{HARNESS_MEMORY_DIR}}/plans/design.md`。Design §11 / §11.4 / §11.7 所有信息已沉淀到 `{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md` 两沉淀章节；缺失 → 返 BLOCKED。

## 步骤 2：重构

- 提取重复代码、改善命名、简化逻辑
- 每次修改后运行 `[test-quiet]`；失败时运行 `[test-detail]` 查看错误信息
- 本步骤不得添加新功能
- 重构前先 grep 项目中类似模块的结构作为参考

## 步骤 3：静态分析质量门禁

依据 feature.md §静态分析与质量工具命令 / §11.4 静态分析命令（若非 "N/A"）：

1. 运行表中每行的命令字符串（如 `npx eslint .`、`mvn checkstyle:check`、`mypy src/`）
2. 修复所有违规项 -- 违规项为**阻塞性问题**
3. 修复后重新运行测试
4. 工具自行读取配置；不要手动解析配置文件
5. 不得回访 `{{HARNESS_MEMORY_DIR}}/plans/design.md`；若本章节显式 N/A → 跳过阶段 3

## 步骤 4：S11 合规检查

**a) S11.1 合规：**
1. 运行 `git diff --name-only` 识别功能的新增/修改文件
2. 从 feature.md §全局约束摘录 §11.1 表（本特性交集子集）读取每行的"被替代方案"列；对每个非空条目，grep 新增/修改的源文件查找被替代的导入模式。匹配即违规，必须修复。
3. 不得回访 `{{HARNESS_MEMORY_DIR}}/plans/design.md` 的原始 §11.1 全表 — 若 `{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md` 摘录缺失 → 返 BLOCKED。

**b) 现有代码复用验证：**
1. 读取功能设计的"现有代码复用"章节
2. 对每个 REUSE 项：grep 实现文件查找预期的导入
3. 如果 REUSE 项未导入但等效功能被重新实现 -> 违规 -> 替换为 REUSE 导入

**c) 实现摘要合规：**
1. 读取功能设计的"实现摘要"
2. 对每行：验证对应文件/类已创建或修改
3. 检查未在摘要中但被修改的源文件 → 标记为潜在范围蔓延

**d) UML 图合规**（若功能设计含 mermaid 图）：
1. `classDiagram`：grep 每个类节点名 → 确认类存在；`classDef MODIFIED` 节点 → `git diff` 确认该类有实际变更；未在图中声明但被修改的类 → 范围蔓延告警
2. `sequenceDiagram`：对每条 `A->>B: method(args)` 消息 → grep `method` 在 `B` 对应类文件中的定义 + grep 调用点在 `A` 对应类文件中存在；缺一即违规
3. `stateDiagram-v2`：grep 每个状态名与事件名 → 确认出现在代码中（如枚举值、常量或状态机框架调用）；缺失即违规
4. `flowchart TD`：对每个决策节点的判定条件 → grep 确认实现中含对应分支；图中未声明但代码含的额外分支 → 告警（可能超出设计范围）

发现任何违规时：修复，重新运行测试以确认无回归，重新检查。

## 步骤 5：最终验证

运行 `[test-quiet]` -- 所有测试通过，静态分析零违规，S11 合规检查通过。

## 总结

按 `SKILL.md` 中的结构化返回契约格式返回。

## 重构原则

**一致性优先于去重**：重构 SubAgent 与 Green 阶段**独立重读** `{{HARNESS_MEMORY_DIR}}/notes/feature-<id>-design.md` 的 §现有代码复用 / §实现摘要 / §全局约束摘录 / §静态分析与质量工具命令 —— 即使 Green 已读过同一份文档，也必须重新加载，不得依赖跨节点的工作记忆缓存。同一约束在不同节点被独立验证两次，优于"为了不重复读"而省略某一次校验。

派生符号清单（变更产物对设计的暴露面）：

1. 新增或重命名的方法
2. 改动的参数类型 / 异常类型
3. 跨模块移动的函数
4. 新增或调整的数据字段

对清单中每一项，逐字核对是否仍与 feature.md §实现摘要 / §现有代码复用 对应行字面一致（含 UML 图节点 / 边）。

## 硬门逻辑

**设计对齐未通过不得进入静态分析**。理由：偏离的符号若被静态分析工具忽略（lint / typecheck 默认放过未在设计中声明的符号），将在后续 Inline Check P2/D3 / S11 合规检查阶段被拦截，造成更晚的回退成本。

强制执行顺序：

1. 步骤 4 S11 合规检查（a-d 全部）**先于** 步骤 3 静态分析质量门禁的**修复确认轮**
2. 若 S11 任一子项发现偏离 → 进入"偏差处理"流程 → 解决后**才**重新进入静态分析门禁
3. 任何"静态分析已通过但 S11 未过"的中间状态都不得视为可放行

## 偏差处理

S11 合规检查（步骤 4 a-d）发现实现与 feature.md / 设计 mermaid 图不一致时，按下列三分支处理：

| 偏离性质 | 处理动作 |
|---|---|
| **偏离合理**（设计未覆盖此场景 / 设计有遗漏 / 实现的方案确实优于设计） | 更新 feature.md 对应章节（§实现摘要 / §现有代码复用 / §11 全局约束摘录）+ 若涉及 UML 图同步更新 mermaid 节点 / 边 + 复查 §测试清单 是否需要补充；**设计与代码须落在同一 commit** |
| **偏离不合理**（实现偏离了设计的合理约束 / 引入了 §11 被替代方案） | **回滚重构改动** 至设计对齐状态，重新走一遍重构循环（提取 / 命名 / 简化）但保持设计契约 |
| **无法本地消解**（设计本身存在矛盾 / 跨多个 feature 的契约冲突 / 需上游决策） | 返 `blocked` 并附 `[CONTRACT-DEVIATION]` blocker；不得擅自二选一，由上游协调 |

落地要求：

- 同一 commit 原则：当走"偏离合理"路径时，feature.md 修改 + 实现代码 + 测试调整必须打包进同一次 `git commit`，避免出现"设计已改但代码尚未跟进"的中间提交污染 blame
- UML 图同步：若偏离涉及 `classDiagram` / `sequenceDiagram` / `stateDiagram-v2` / `flowchart TD` 节点，**先**更新 mermaid 源码，**再**核对 grep 结果重新通过 S11 步骤 d
- blocker 信息：`[CONTRACT-DEVIATION]` 必须附"偏离的具体符号 + feature.md 中对应行号 + 实现中对应文件行号 + 为何本地无法消解"四要素，缺一不补
