---
name: procurement-local-inventory-lookup
description: 通过飞书多维表格查本地仓库和供应商库存。当用户问“有没有货/库存还剩多少/这个型号本地有吗/仓库里有没有”，或采购流程中需确认某型号当前库存状态时使用。只查内部库存表；查外部平台报价用 procurement-platform-search，查供应商名单用 procurement-supplier-shortlist。
metadata:
  short-description: 本地库存查询
  lang: zh
---

# 本地库存查询

输入一个型号，查飞书 Base 里的本地/供应商库存，给采购展示库存线索。用 lark-cli / lark-base skill 查表。

不做比价、供应商真假、下单建议、替代料判断。

## 数据源（飞书 Base）

- Base：供应商管理（正式版），token `Mjlkb49B9aoptssVw8Jc0wGwnhh`
- 先查汇总表 `查找库存`（`tbl9I8ZWFwCMlxNm`），它已经 lookup 了下面各源表
- 源表：A级 `tblzQbSnVNhGszYA`、B1 `tbldOthm6zmFonDM`、B2 `tblqaoi5UuUGybxF`、B3 `tbld53dBj2dvI1R6`、C级 `tblBbvvRKB0Ziioz`、自家 `tblSUjXdehzkxIbK`

## 规则

1. 先用型号查 `查找库存`。
2. 命中清楚的供应商/数量/单价/自家库存就直接展示。
3. 没命中、型号被模糊扩展、合并不清、或需原始明细，再查 A/B/C/自家源表。
4. 只命中不同型号（如查 `55A0111-24-2` 命中 `55A0111-24-2L`）只能写“命中但需复核”，不能写成有库存。
5. 输出注明结果来自 `查找库存` 还是源表复核。

## 边界

有库存 ≠ 可下单。型号扩展/合并不等于型号等价；型号不同转 `procurement-part-mismatch-review`。
