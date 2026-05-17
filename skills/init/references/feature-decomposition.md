# Feature 拆分与 Sizing 关卡

供 init Step 5.2 严格执行。Step 5 主 agent 依据本文档从 SRS / Design 抽取 features[]，并按 LOC 估算分类带（small / ok / large）决定是否走 sizing 关卡。

## LOC 估算公式

```
est_loc = (sum of AC counts × 80) + (interface-contract method count × 100) + (test-inventory estimated rows × 30)
```

- **AC 数**：来自 feature.srs_trace 中每个 FR/NFR 的验收准则数（SRS §4 / §5）
- **接口方法数**：feature 涉及的接口契约方法数（Design §4 接口章节）
- **测试条目数**：从 ATS 估值（Design §4 / ATS feature 行）

公式透明可复核 — 主 agent 估算时应在主对话中给出每个 feature 的三项中间数与最终 est_loc，方便用户审计。

## sizing 带分类

| 带 | LOC 区间 | 处置 |
|---|---|---|
| **small** | `< 500` | 候选合并（除非语义独立性强） |
| **ok** | `500–1500` | 直接通过 |
| **large** | `> 1500` | 候选拆分 |
| **特殊：single_round** | 上限放宽至约 2000 | SRS frontmatter `Single-Round: Yes` 时上限放宽 |

## 拆分决策（large 带）

> ⚠ **主 agent 不擅自拆分**；先把分布呈给用户走 sizing 关卡（见下），仅在用户选择 `auto-fix` 时按下列规则拆。

拆分原则：

1. **按 srs_trace 拆**：若 feature 含多条 FR，按 FR 拆为子 feature；每子 feature 保留至少 1 条 FR；ID 在原 feature 后加字母后缀（`5` → `5a`, `5b`）
2. **按 verification_steps 拆**：若单 FR 内 AC 跨多个独立场景（例如同一 FR 含 CRUD 4 个独立操作），按场景拆
3. **拆后约束**：每子 feature 必须再次过 sizing（est_loc 应回到 ok 带）；srs_trace 必须互斥（无重复 FR）；dependencies 数组沿用父 feature

## 合并决策（small 带）

合并原则：

1. **同 wave + 同 category 同 srs_trace 重叠**：可合并；合并后 verification_steps 合并去重
2. **CRUD 4 操作分别 small**：通常合并为单 feature（无独立性）
3. **合并后约束**：合并后 est_loc ≤1500（超出回退）；保留每条 FR 的 srs_trace；合并 feature 取双方 priority 高者

## sizing 关卡（主 agent 必走）

主 agent 在产出初版 features[] 后，**呈现 loc_distribution + feature_summary 给用户**，AskUserQuestion 三选一：

| 选项 | 处理 |
|---|---|
| `y` (approve) | 直接通过；进入 Step 5.3（check_configs 生成） |
| `auto-fix` | 主 agent 按上述拆分/合并规则自动调整；调整后再次过本关卡（最多 2 轮，第 3 次自动 escalate） |
| `manual-adjust` | 主 agent 暂停，提示用户直接编辑 `{{HARNESS_MEMORY_DIR}}/plans/<topic>-feature-list.json`；resume 后只重跑 references/feature-validation.md 校验，不重算 sizing |

呈现内容应包含：

```
Feature 分布：small=2 / ok=11 / large=2
─ small 候选合并：
  • #3 「按钮 disabled 状态」(est_loc=380) — 与 #2 「按钮 enabled」合并？
  • #14 「错误提示样式」(est_loc=420) — 独立性强建议保留
─ large 候选拆分：
  • #7 「订单完整流程」(est_loc=2200) — 拆为 7a「创建订单」 + 7b「取消订单」？
  • #11 「权限管理 CRUD」(est_loc=1800) — 4 操作合并 1 feature，可保留亦可拆
```

## 反模式

| Anti-Pattern | Correct |
|---|---|
| 主 agent 在 Step 5 内直接拆分/合并不问用户 | 必须走 sizing 关卡；除非用户 `auto-fix` 才动 |
| 拆分后丢 srs_trace | 子 feature 必须保留父 feature 的 srs_trace（互斥分配） |
| 合并后 verification_steps 不去重 | 合并必须去重；冲突场景由主 agent 重写 |
| 用旧硬编码 10-200 数量区间做 sizing | 按 est_loc 公式动态算；小项目允许 < 10 features |
| 在 sub 段做合并 / 拆分决策（旧 init-features SubAgent 行为） | 由主 agent 持 sizing 关卡，业务判断不可机器仲裁 |
