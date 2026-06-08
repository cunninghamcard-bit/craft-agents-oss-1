---
name: procurement-part-mismatch-review
description: 当采购需求型号与供应商报价型号不一致时，基于公开网页资料判断二者能否互相替代、差异是否影响使用，并给出证据。当用户同时给出“需求型号”和“报价型号”且两者不同（后缀/封装/批次差异），问“这俩能不能用/有没有区别/能替代吗”时使用。
metadata:
  short-description: 采购/报价型号差异判断
  lang: zh
---

# 采购/报价型号差异判断

## Quick start

```bash
python3 .agents/skills/procurement-part-mismatch-review/scripts/search_web.py --requested "M81969/8-05" --offered "DAK95-20B(M81969/8-05)" --limit 8 --output "/tmp/evidence-search.json"
```

已确定要查分销商页面时，用 platform-search 的采集器分别查两个型号的 exact MPN 页面。

## 只处理这件事

输入两个不同型号：

- 采购型号：BOM、客户需求、请购、询价里的型号。
- 报价型号：供应商报价、平台标题、SKU、替代料、订货号里的型号。

回答采购要的业务问题：报价型号能不能接受。

不要用这个 skill 做全表筛选、普通采购搜索、比价、供应商真伪判断。

## 底线

- 必须查公开网页资料，不能只靠字符串相似。
- 能查到报价型号资料，不等于可以代替采购型号。
- 业务结论优先收敛到两类：`不影响使用`、`影响使用`。
- `公开资料不足` 不是业务结论，必须细化为不足类型：`差异资料不足`、`关系证据不足`、`使用条件不足`。
- 后续处理建议要和业务结论分开写，不能混成第三种结论。
- 页面打不开、网站要求验证、资料暂时无法访问要单独写成资料获取阻碍，不能当作差异不存在。

## 执行入口

先读 [references/search-workflow.md](references/search-workflow.md)，按里面的方法查资料。

需要判断能不能接受时，读 [references/decision-rules.md](references/decision-rules.md)。

最终回复用户时，按 [references/output-format.md](references/output-format.md) 输出，只用业务语言。

需要看覆盖过哪些场景时，再读 [references/16-case-flow-test.md](references/16-case-flow-test.md)。这些样例是历史压测记录，不是当前输出规则。

需要检查边界样例时，读 [references/minimal-acceptance.md](references/minimal-acceptance.md)，尤其是写法差异、alternate-name、后缀差异、字符混淆这些容易误放行的场景。

## 时间要求

单个型号对目标 2 分钟：

- 先定位型号差异并决定要找哪类资料。
- 打开 3-5 个最可能有用的页面。
- 超时就用当前资料收口，说明没查到什么和还要补什么。

## 采集脚本

还不知道证据源在哪里时，用公开网页搜索脚本找入口：

```bash
python3 .agents/skills/procurement-part-mismatch-review/scripts/search_web.py --requested "<采购型号>" --offered "<报价型号>" --limit 8 --output "/tmp/evidence-search.json"
```

已经确定要查分销商页面时，转用平台线索 skill 的采集器。差异判断通常要分别查采购型号和报价型号的 exact MPN 页面或资料入口；不能只查报价型号后就判断可替代。

```bash
python3 .agents/skills/procurement-platform-search/scripts/run_collectors.py --part "<型号>" --collectors digikey,mouser,newark --parallel 3 --output "/tmp/procurement-search.json"
```

脚本只是找入口。最终判断必须回到网页资料本身；平台页面有型号资料不等于可以替代采购型号。
