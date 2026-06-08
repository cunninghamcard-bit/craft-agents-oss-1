---
name: procurement-part-mismatch-review
description: 当采购需求型号与供应商报价型号不一致时，基于公开网页资料判断二者能否互相替代、差异是否影响使用，并给出证据。当用户同时给出“需求型号”和“报价型号”且两者不同（后缀/封装/批次差异），问“这俩能不能用/有没有区别/能替代吗”时使用。
metadata:
  short-description: 采购/报价型号差异判断
  lang: zh
---

# 采购/报价型号差异判断

输入两个不同型号（采购型号 + 报价型号），用公开网页资料判断报价型号能不能接受、差异是否影响使用，并给证据。

用你自己的联网工具（WebSearch / WebFetch）分别查两个型号的 exact MPN 页面或原厂资料。不能只查报价型号就判断可替代，也不能只靠字符串相似。

方法和规则在 references/，按需读：

- 怎么查（搜索词、开哪些页、提取什么）：[references/search-workflow.md](references/search-workflow.md)
- 怎么判断：[references/decision-rules.md](references/decision-rules.md)
- 怎么输出（只用业务语言）：[references/output-format.md](references/output-format.md)
- 容易误放行的边界样例：[references/minimal-acceptance.md](references/minimal-acceptance.md)

## 结论收敛

- 业务结论只两类：`不影响使用` / `影响使用`。
- 资料不足时细化为：`差异资料不足` / `关系证据不足` / `使用条件不足`（不是第三种结论）。
- 页面打不开/要验证单独写成资料获取阻碍，不能当作差异不存在。

单型号对目标 2 分钟：打开 3-5 个最可能有用的页面，超时就用现有资料收口并说明缺口。

## 边界

只处理两个型号能否互用，不做全表筛选、普通比价、供应商真伪。
