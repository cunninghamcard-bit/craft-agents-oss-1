---
name: procurement-supplier-shortlist
description: 查飞书 Base 里的供应商档案，按品牌、品类、供应商类型整理出候选名单。当用户问“哪些供应商能供这个/帮我列几家供应商/谁家做这个品类”，需要筛选或对比供应商时使用。产出供应商名单，不查具体报价（报价用 procurement-platform-search）。
metadata:
  short-description: 供应商候选名单筛选
  lang: zh
---

# 供应商候选名单筛选

## Quick start

```bash
python .agents/skills/procurement-supplier-shortlist/scripts/shortlist_suppliers.py --brand "Omron" --category "传感器" --limit 20
```

可多次传 `--brand` 覆盖中英文品牌名。

## 只处理这件事

输入品牌、品类、型号特征，查询供应商档案，整理采购人员可联系的候选名单。

不要做供应商真假判断、付款风险判断、价格优劣判断、下单建议。

## 固定数据源

默认 Base：

- Wiki：`https://pcn6r1o1u3g6.feishu.cn/wiki/X2zgwdBOsiv52CkOcCPcwV7mn8f`
- Base：`供应商管理（正式版）`
- 表：`供应商档案`
- table id：`tblbtuMHFIOr6Oss`
- 默认视图：`供应商总清单`（view id：`vew2iLJ778`）

这个表用于供应商名单筛选，不用于库存数量查询。库存数量走 `procurement-local-inventory-lookup`。

## 可组合用法

本 skill 不等待其他 skill，只要任务需要候选供应商名单就可以单独运行。输入可来自型号信息、库存状态、平台线索或采购人员直接给出。

无明确库存时，通常和 `procurement-platform-search` 并行运行，两者是独立证据源。输出保留可合并字段：供应商名称、类型/等级、品牌/品类匹配强弱、联系方式、官网/店铺、联系状态、未覆盖信息、人工确认项。

## 输入

- 优先输入：品牌、品类。
- 可选输入：型号、平台线索、地区偏好、供应商类型偏好。
- 品牌/品类缺失时，调用方应先补型号信息或让用户补字段；本 skill 不负责调用型号信息搜索。

## 执行入口

```bash
python .agents/skills/procurement-supplier-shortlist/scripts/shortlist_suppliers.py --brand "<品牌>" --category "<品类>" --limit 20 --output "/tmp/supplier-shortlist.json"
```

## 筛选原则

优先展示：

- 主营品牌或优势产品命中品牌/品类。
- 原厂、授权代理/授权分销商、平台自营分销商。
- 已建联、已交易、联系方式明确。
- 有官网/店铺、联系人、联系媒介。

贸易商可以进入候选，但必须标明类型，不能伪装成授权或原厂。

匹配原因必须区分强弱：`品牌命中(主营品牌)` 强命中 > `品牌提及(优势产品)` 中等 > `品牌弱命中(备注/询价品牌)` 仅作历史线索。`品类命中(优势产品)` > `品类弱命中(备注/询价品牌)`。

联系方式也要区分：有具体 `联系方式` 才写“联系方式可用”；只有电话/QQ/邮箱等 `联系媒介` 时，只能写“有联系媒介记录”。

供应商类型只看 `供应商类型` 字段。`付款风险` 里的“平台预付”等文字不是供应商类型，不能据此写成平台供应商。

短品牌名要防止子串误命中。比如 `ST` 只能匹配独立 `ST`、`STMicroelectronics` 或明确 `STM32...` 这类线索，不能把 `Kingston`、`Transcend`、`storage` 当成 ST 品牌命中。

## 输出

```text
供应商候选：
- 供应商：...
  类型/等级：...
  匹配原因：品牌/品类/优势产品/历史询价...
  联系方式：...
  官网/店铺：...
  备注：...

未覆盖：
- 未找到品牌直连供应商 / 品类命中弱 / 联系方式缺失 ...

人工确认项：
- 是否仍在合作、是否可供该型号、是否有现货/报价、是否需要补授权或来源材料。
```

脚本输出是 JSON，包含 `coverage_notes`、`decision_boundary`、`manual_confirmation_items`。对采购人员回复时，把这些字段翻成业务可读文本，不要只粘贴原始 JSON。

## 边界

- 候选名单不是供应商准入结论。
- 供应商档案里的付款风险字段只可展示，不在本 skill 内做风险判断。
- 有供应商候选不等于有库存；库存必须回到 `查找库存` 或供应商实时报价确认。
