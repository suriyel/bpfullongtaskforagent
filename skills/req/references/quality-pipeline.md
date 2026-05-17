# 质量流水线方法论

供 req SKILL.md Step 7-11 严格执行。本文件涵盖三块详表：EARS 撰写、质量校验、粒度分析。

## §EARS — 用 EARS 模板撰写

对每条 FR 选一个模板：

| 模式 | 模板 |
|---|---|
| Ubiquitous | The system shall `<action>`. |
| Event-driven | When `<trigger>`, the system shall `<action>`. |
| State-driven | While `<state>`, the system shall `<action>`. |
| Unwanted behavior | If `<condition>`, then the system shall `<action>`. |
| Optional | Where `<feature/config>`, the system shall `<action>`. |

为每条 FR 附加：
- **验收标准**：≥1 个 Given/When/Then 场景
- **视觉输出**：UI 面向写"用户所见变化"一句；否则 "N/A — backend-only"
- **优先级**：MoSCoW（Must / Should / Could / Won't）
- **来源**：追溯到用户叙述 / walkthrough 步骤 / hidden-req 探针

对每条 NFR 必须带**可度量阈值**。

## §quality-checks — 质量校验

### D.1 逐需求 8 属性

| # | 属性 | 红旗 |
|---|---|---|
| 1 | Correct | 孤立需求（无来源）|
| 2 | Unambiguous | "快"、"健壮"、"用户友好" |
| 3 | Complete | "包括但不限于……" |
| 4 | Consistent | 时序 / 格式冲突 |
| 5 | Ranked | 全部都是"高优先级" |
| 6 | Verifiable | "系统应易于使用" |
| 7 | Modifiable | 跨章节重复 |
| 8 | Traceable | 缺 ID 或孤立 |

### D.2 反模式

| 反模式 | 修正 |
|---|---|
| 模糊形容词无数字 | 量化 |
| "and" / "or" 连接两项能力 | 拆分 |
| "class" / "table" / "endpoint" | 重写为行为 |
| 被动无主语 | 加入角色 |
| TBD / TBC | 解决或转 Open Question |
| 只规定正向情况 | 加入错误 / 边界 |
| NFR 无阈值 | 加入度量 |

### D.3 完备性交叉检查

- 每个功能区域 ≥1 错误 / 边界情况
- 所有外部接口有数据格式 + 协议
- 所有 NFR 有度量方法
- 术语表覆盖所有领域术语
- Out-of-Scope 节列出延后特性

自动修复 D.1 / D.2 / D.3 中 LLM-FIXABLE 项（改写措辞、加默认 MoSCoW、补 Given/When/Then 骨架）。修复不了的进入 `user_input_required[]` 由主 agent 驱动 AskUserQuestion。

## §granularity — 粒度分析

### sizing_tier

| tier | 每 FR AC 目标 |
|---|---|
| `standard`（≤200K）| 3–12 |
| `extended`（>200K）| 5–20 |

### E.1 过大检测 G1–G6

多角色 / CRUD 捆绑 / 场景爆炸（AC 超上限）/ 跨层关注 / 多状态 / 时序耦合 → 拆分候选（子 ID 加 a/b/c 后缀，保持 srs_trace）。

### E.2 过小检测 S1–S4

琐碎新增 / 单一断言 / 纯数据回显 / 仅 config setup → 合并候选（保留主 FR ID，描述注 "Incorporates: [...]"）。

### E.3 决策阈值

| 候选数 | 动作 |
|---|---|
| 0 | 跳过 |
| 1–3 | 自动应用；rationale 写入 `granularity_auto_applied[]` |
| 4+ | **不自动应用**；全部进 `granularity_user_input_required[]`，主 agent 驱动 AskUserQuestion |

**合并规则**：
- 合并后 AC ≤20（超了重触发 G3 拆分）
- 合并 FR 须共享主角色与功能区域
- 同一 FR 同时触发 G 与 S 时 G 优先

### F. 范围契合与延后

- Must 永不延后
- 依赖完整性：FR-X 依赖 FR-Y → 两者同进退
- 候选延后项进 `deferral_candidates[]`，保留 EARS + AC（供 Step 15 写 `*-deferred.md`）
