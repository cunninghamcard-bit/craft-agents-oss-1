# Agent 回复质量评测体系 — 设计文档

- 日期: 2026-06-05
- 状态: 草案,待 product owner 评审
- 适用: craft-agents-oss(飞书内网 + GFW + DeepSeek 后端的自托管 agent 服务)

## 1. 问题

当前**无法测量** agent 的回复质量。任何"优化"(改 prompt、调搜索、写 skill)都是拍脑袋——改完不知道有没有变好,变好了说不出好在哪一环。

2026 年大规模跑 agent 的公司(Anthropic、Cognition、Hamel Husain、Braintrust)给出同一套答案:**提升质量靠"误差分析驱动的评测闭环",不靠堆技巧。** 本文档把这套体系落到本项目。

参考:
- [Anthropic《Demystifying evals for AI agents》(2026-01)](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Hamel Husain《Evals FAQ》](https://hamel.dev/blog/posts/evals-faq/)
- [Cognition《Devin 生产复盘》](https://cognition.ai/blog/devin-annual-performance-review-2025)
- [Braintrust《Agent Observability 2026》](https://www.braintrust.dev/articles/agent-observability-complete-guide-2026)

## 2. 约束(决定了方案形状)

1. **数据不出网**: 飞书内网 + GFW + 含用户数据的真实会话。**禁止**把 trace 传到美国 SaaS(Braintrust/LangSmith/Arize)。评测体系必须自托管、在仓库内。
2. **小团队**: 质量裁判 = product owner 一人("benevolent dictator",判定不外包)。
3. **trace 已存在**: pi-agent 会话存为 `{workspaceRootPath}/sessions/{id}/session.jsonl`(行1=header,行2+=消息;JSONL)。多用户下 `workspaceRootPath` 为 per-user(`~/.craft-agent/user-workspaces/<openid>`)。**原料已有,只是没人挖。**
4. **后端是 DeepSeek**(非 Claude): 更易"欠触发"技能、更依赖明确 grounding 指令、更吃"摘要 vs 全文"的亏 → prompt/skill 级杠杆收益更大。

## 3. 总体架构:两条咬合的轨

```
轨一·测量(eval 闭环) —— 温度计
  trace ──误差分析──▶ failure_tag ──提炼──▶ case ──runner──▶ run_result ──▶ metric(pass^k)
                                                                                    │
                                                                                    ▼
轨二·业务调优(杠杆面) —— 药   ◀────────────── 由轨一验证哪味药有效 ───────────────┘
  · 搜索平台钉死   · prompt 垂直叠加   · skill 业务化(选用/描述/触发)
```

- **轨一**没有 → 瞎改。**轨二**没有 → 只量不治。两条一起才是体系。
- "固定搜索几个平台"是轨二的一个杠杆,由轨一在真实问题上用 pass^k 验证。

## 4. 数据结构(骨架,先想清这个)

| 实体 | 落地形式 | 字段 |
|------|----------|------|
| `trace` | 已有的 `session.jsonl` | header + messages(含 tool 调用与参数、模型输出、最终答案) |
| `failure_tag` | 误差分析产物,`docs/evals/error-analysis-<date>.md` | `{trace_id, first_failure_step, category, note}` |
| `case` | `evals/cases/*.yaml` | `{id, scenario, input, setup?, pass_criteria, reference?, category}` |
| `run_result` | runner 输出,`evals/runs/<ts>.jsonl` | `{case_id, trial_n, pass/fail, judge_rationale, tokens, latency}` |
| `metric` | 报告 | 按 category 的 **pass^k**(不是 pass@k) |

数据从 `trace → failure_tag → case → run_result → metric` 流动,metric 回头指导轨二改哪味药。

## 5. 轨一:评测闭环(分三阶段)

### 阶段 0 — 误差分析(纯诊断,不动产品)

Hamel:"误差分析是评测里最重要的活动";Anthropic:"60–80% 的开发时间花在这。"

- **提取器**(`evals/extract-traces.ts`): glob `**/sessions/*/session.jsonl` → 归一成人类可读 trace(用户输入、每步 tool+参数、输出、最终答案)。脱敏 open_id。
- **评审流程**:
  1. Open coding: 逐条读,只标**第一个上游失败**(下游多是级联),自由记笔记
  2. Axial coding: 归类 + **按频次计数**(此步最重要)
  3. 读到饱和:连续 ~20 条不出新类别即停(累计 ~100;首轮 20–50 起步)
- **产出**: `docs/evals/error-analysis-<date>.md` —— 失败模式频次表 + 每类 1–2 个代表 trace。
- **判定**: 频次最高那类 = 下一步该修的(技能/搜索/grounding/模型,**有证据**)。

### 阶段 1 — 仓库内最小评测闭环(`evals/`)

- **用例集** `evals/cases/*.yaml`: 从**真实失败**提炼 20–50 个;每个一句话 `pass_criteria`;两个领域专家能独立得出同一 pass/fail(Anthropic 的"好任务"标准)。
- **runner** `evals/run.ts`: headless 调 agent 跑每个 case,每个 N 次试(为 pass^k)。
- **打分器** `evals/graders/`:
  - 确定性 → 代码判(断言/正则/schema);
  - 主观 → LLM-judge(自托管模型),**二元判定不用 1–5 分**;
  - judge **必须用 product owner 的人工标注集校准**,测 TPR/TNR,达标才信。
- **报告**: 按 category 输出 **pass^k**。诚实数字——单次 75% → pass^3 ≈ 42%,这才是用户体感。

### 阶段 2 — 闭环转起来

- 每周(新系统)/每月(稳定后)误差分析 → 修频次最高类 → 在**新鲜** trace 上重测 → 进 CI 当回归网;某能力评测饱和(100%)就"毕业"转回归。

## 6. 轨二:业务调优杠杆面(可插拔,具体待填)

轨一是裁判,轨二是被验证的"假设"。本设计只定**杠杆插槽**,具体值由 product owner 提 case 时填:

1. **搜索平台钉死**: 把 web_search 从"满世界搜"约束到**领域平台 allowlist/优先级**(经 SearXNG engines 或域名过滤实现)。每次改 → 轨一在真实领域问题上测 pass^k。
2. **prompt 垂直叠加**: 在 system prompt 上叠加领域人设/指令(含 grounding/引用/自检)。
3. **skill 业务化**: 选用哪些 skill、描述按 Anthropic 最佳实践调(第三人称、写明触发场景、稍"pushy")、是否预加载 name+desc 让其自动触发。

> 每个杠杆都是一个待验证假设,**先有 case 和 pass^k,再动**。

## 7. 明确不做(YAGNI)

- ❌ 不上 SaaS 可观测/评测平台(数据不出网)。
- ❌ 不用通用指标(BLEU/ROUGE/"helpfulness 1–5")——Hamel 头号坑。
- ❌ 不在误差分析前写评测(不给"想象的"错误写 case)。
- ❌ 不按"工具调用路径"打分——判**结果**对不对,不判路径(Anthropic)。

## 8. 成功标准

- **阶段 0**: 从 ≥30 条真实 trace 产出失败频次表,用证据点名头号失败模式。
- **阶段 1**: ≥20 个 case 上报出 pass^k;judge 的 TPR/TNR ≥ 约定阈值(对齐人工标注)。
- **阶段 2**: 跑通一整圈(测量→修→重测,数字有移动)。

## 9. 待定(评审/后续填)

- 业务垂直方向与钉死的具体平台(product owner 提 case 时定)。
- judge 用哪个模型(DeepSeek 自评 vs 更强的本地模型)。
- runner 怎么 headless 拿到 agent 入口(复用 pi-agent-server 的 session 启动路径)。
- 阈值: pass^k 目标线、judge TPR/TNR 合格线。
