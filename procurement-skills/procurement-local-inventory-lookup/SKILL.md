---
name: procurement-local-inventory-lookup
description: 通过飞书多维表格查本地仓库和供应商库存。当用户问“有没有货/库存还剩多少/这个型号本地有吗/仓库里有没有”，或采购流程中需确认某型号当前库存状态时使用。只查内部库存表；查外部平台报价用 procurement-platform-search，查供应商名单用 procurement-supplier-shortlist。
metadata:
  short-description: 本地库存查询
  lang: zh
---

# 本地库存查询

## Quick start

```bash
python .agents/skills/procurement-local-inventory-lookup/scripts/lookup_inventory.py --part "55A0111-24-2"
```

无明确命中时追加源表复核：`--include-source`。

## 只处理这件事

输入一个型号，通过飞书 Base 查询本地/供应商库存，并把采购能看的库存线索展示出来。

不要做比价、供应商真假、下单建议、替代料判断。

## 固定数据源

默认 Base：

- Wiki：`https://pcn6r1o1u3g6.feishu.cn/wiki/X2zgwdBOsiv52CkOcCPcwV7mn8f`
- Base：`供应商管理（正式版）`
- Base token：`Mjlkb49B9aoptssVw8Jc0wGwnhh`

必须先查：

- `查找库存`（table id：`tbl9I8ZWFwCMlxNm`）

`查找库存` 是库存查询汇总表，字段里已经通过 lookup 拉取：

- `A级供应商库存`
- `B级供应商库存1`
- `B级供应商库存2`
- `B级供应商库存3`
- `C级供应商库存`
- `自家库存`

源表固定 table id：

- `A级供应商库存`：`tblzQbSnVNhGszYA`
- `B级供应商库存1`：`tbldOthm6zmFonDM`
- `B级供应商库存2`：`tblqaoi5UuUGybxF`
- `B级供应商库存3`：`tbld53dBj2dvI1R6`
- `C级供应商库存`：`tblBbvvRKB0Ziioz`
- `自家库存`：`tblSUjXdehzkxIbK`

## 硬规则

1. 先用型号查 `查找库存`。
2. 如果 `查找库存` 返回了清楚的供应商、数量、单价、自家库存，直接展示。
3. 如果 `查找库存` 没命中、型号被模糊/扩展、结果合并得不清楚，或采购需要原始库存记录，继续查 A/B/C/自家库存源表。
4. 如果源表只命中了不同型号，例如查询 `55A0111-24-2` 但命中 `55A0111-24-2L`，只能写“命中但需复核”，不能写成直接有库存。
5. 输出必须说明结果来自 `查找库存` 还是源表复核。

## 可组合输出

本 skill 不触发其他 skill，只输出库存状态和可复用线索。无明确命中时，输出需保留：库存状态（未查到/命中但需复核/有记录无明确数量）、可继续使用的型号、采购缺口。

无明确库存时，可并行组合 `procurement-platform-search` 和 `procurement-supplier-shortlist`。两者是独立证据源，不互为前置条件。命中相近型号按”没有明确命中库存”处理；需判断差异时再组合 `procurement-part-mismatch-review`。

## 执行入口

```bash
# 基础查询
python .agents/skills/procurement-local-inventory-lookup/scripts/lookup_inventory.py --part "<型号>"
# 追加源表复核
python .agents/skills/procurement-local-inventory-lookup/scripts/lookup_inventory.py --part "<型号>" --include-source
# JSON 输出
python .agents/skills/procurement-local-inventory-lookup/scripts/lookup_inventory.py --part "<型号>" --format json --output "/tmp/local-inventory.json"
```

## 输出

```text
本地库存：
- 查询型号：...
- 命中情况：有库存 / 未查到库存 / 命中但需复核
- 自家库存：...
- 供应商库存：
  - 供应商：...
    等级/来源表：...
    数量：...
    单价：...
    备注：...
- 资料来源：查找库存 / 源表复核
- 需要人工确认：...
```

## 边界

- 有库存只表示可展示库存线索，不表示供应商可靠、价格合理、可以下单。
- 库存表型号扩展或合并时，不要把它当成型号等价判断；型号不同要转给 `procurement-part-mismatch-review`。
