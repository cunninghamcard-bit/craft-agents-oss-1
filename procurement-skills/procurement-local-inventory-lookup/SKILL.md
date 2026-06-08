---
name: procurement-local-inventory-lookup
description: 通过飞书多维表格查本地仓库和供应商库存。当用户问“有没有货/库存还剩多少/这个型号本地有吗/仓库里有没有”，或采购流程中需确认某型号当前库存状态时使用。只查内部库存表；查外部平台报价用 procurement-platform-search，查供应商名单用 procurement-supplier-shortlist。
metadata:
  short-description: 本地库存查询
  lang: zh
---

# 本地库存查询

输入一个型号，用 `lark-cli base` 命令查飞书 Base 的本地/供应商库存，给采购展示库存线索。

不做比价、供应商真假、下单建议、替代料判断。

## 数据源（飞书 Base，base-token `Mjlkb49B9aoptssVw8Jc0wGwnhh`）

- **汇总表 `查找库存`**（table-id `tbl9I8ZWFwCMlxNm`）：字段含 `型号` + 各级供应商的 `A/B1/B2/B3/C 供应商·库存数量·单价` + `自家库存` + `动态库存(数量/单价)`。**只含已收录型号，不一定全**。
- **源表**（汇总表查不到时逐张查，换 table-id，搜索字段同为 `型号`）：A级 `tblzQbSnVNhGszYA`、B1 `tbldOthm6zmFonDM`、B2 `tblqaoi5UuUGybxF`、B3 `tbld53dBj2dvI1R6`、C级 `tblBbvvRKB0Ziioz`、自家 `tblSUjXdehzkxIbK`。源表字段：`型号 / 品牌 / 库存数量 / 单价 / MOQ / SPQ / 供应商名称 / 供应商等级 / 批次 / 含税未税 / 更新时间`。

## 怎么查（默认 markdown 输出，直接读）

1. **先搜汇总表 `查找库存`**：

       lark-cli base +record-search --base-token Mjlkb49B9aoptssVw8Jc0wGwnhh --table-id tbl9I8ZWFwCMlxNm --json '{"keyword":"<型号>","search_fields":["型号"]}'

   命中就读各级 `供应商 / 库存数量 / 单价` + `自家库存`，给采购。

2. **汇总表 `count=0`（没收录），或只命中相近型号**：逐张搜源表（同样 `--json '{"keyword":"<型号>","search_fields":["型号"]}'`，换 table-id），读 `库存数量 / 单价 / 供应商名称 / 供应商等级`。

3. 输出**注明结果来自 `查找库存` 还是源表**。

> - markdown 有很多列，**只挑库存相关的给采购**（供应商、库存数量、单价、等级、自家库存），别整表照搬。
> - 若返回 `permission`/`scope` 或登录失效错误，**如实告诉用户需要在飞书开放平台给应用开 base 读权限 / 重新登录 lark-cli**，不要编造库存。

## 规则

1. 先用型号查 `查找库存`，没命中再查 A/B/C/自家源表。
2. 命中清楚的供应商/数量/单价/自家库存就直接展示。
3. 只命中不同型号（如查 `55A0111-24-2` 命中 `55A0111-24-2L`）只能写“命中但需复核”，不能写成有库存。
4. 输出注明结果来自 `查找库存` 还是源表复核。

## 边界

有库存 ≠ 可下单。型号扩展/合并不等于型号等价；型号不同转 `procurement-part-mismatch-review`。
