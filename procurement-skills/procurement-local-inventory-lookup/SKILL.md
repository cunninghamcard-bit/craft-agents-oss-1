---
name: procurement-local-inventory-lookup
description: 通过飞书多维表格查本地仓库和供应商库存。当用户问“有没有货/库存还剩多少/这个型号本地有吗/仓库里有没有”，或采购流程中需确认某型号当前库存状态时使用。只查内部库存表；查外部平台报价用 procurement-platform-search，查供应商名单用 procurement-supplier-shortlist。
metadata:
  short-description: 本地库存查询
  lang: zh
---

# 本地库存查询

输入一个型号，用 `lark-cli base` 命令查飞书 Base 的本地/供应商库存，给采购展示库存线索。**只读，不往任何表写数据。**

不做比价、供应商真假、下单建议、替代料判断。

## 核心逻辑（复刻「查找库存」表，但只读）

业务里有张 `查找库存` 汇总表，逻辑是：给一个型号，跨 A/B1/B2/B3/C/自家各级源表把库存/单价/供应商拉到一起。但那张表是**人工逐行填型号才会有数据**，多数型号不在里面。所以你**直接查 6 张源表、自己聚合**来复刻这个逻辑，不依赖、也不写 `查找库存`。

## 数据源（飞书 Base，base-token `Mjlkb49B9aoptssVw8Jc0wGwnhh`；搜索字段都是 `型号`）

源表（逐张搜，可并发）：

- A级 `tblzQbSnVNhGszYA`、B1 `tbldOthm6zmFonDM`、B2 `tblqaoi5UuUGybxF`、B3 `tbld53dBj2dvI1R6`、C级 `tblBbvvRKB0Ziioz`、自家 `tblSUjXdehzkxIbK`
- 字段：`型号 / 品牌 / 库存数量 / 单价 / MOQ / SPQ / 供应商名称 / 供应商等级 / 批次 / 含税未税 / 更新时间`

（可选快路：`查找库存` `tbl9I8ZWFwCMlxNm`——若该型号刚好已被人工填过、有现成汇总行，可先搜它直接读；没命中就走源表聚合，别往里写。）

## 怎么查（默认 markdown 输出，直接读）

对每张源表跑：

    lark-cli base +record-search --base-token Mjlkb49B9aoptssVw8Jc0wGwnhh --table-id <源表table-id> --json '{"keyword":"<型号>","search_fields":["型号"]}'

把各表命中的 `库存数量 / 单价 / 供应商名称 / 供应商等级` 聚合成一个跨级结果给采购。

## 输出

按等级聚合，给采购可用线索：

- 各级（A/B1/B2/B3/C）有没有货、哪家供应商、库存数量、单价；自家库存单列。
- 注明型号是**精确命中**还是**相近命中**（如查 `55A0111-24-2` 命中 `55A0111-24-2L` → 只能写“命中但需复核”，不能写成有库存）。
- 全都没命中就如实写“本地无库存记录”。

> - markdown 列多，只挑库存相关的（型号/库存数量/单价/供应商/等级）给采购，别整表照搬。
> - 若返回 `permission`/`scope` 或登录失效错误，**如实告诉用户需要在飞书开放平台开 base 读权限 / 重新登录 lark-cli**，不要编造库存。

## 边界

有库存 ≠ 可下单。型号扩展/合并不等于型号等价；型号不同转 `procurement-part-mismatch-review`。只读源表自己聚合，不写 `查找库存` 或任何表。
