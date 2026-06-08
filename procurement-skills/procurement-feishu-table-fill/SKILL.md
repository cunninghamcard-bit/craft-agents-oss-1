---
name: procurement-feishu-table-fill
description: 把采购线索或分析结果写入飞书 Base 的 AI 专用表，含建表、字段校验、dry-run 预览和用户确认。当用户说“把结果填进表/写到飞书表格/录入这些数据”，需要把前面查到的型号、报价、库存、供应商结果落库时使用。只负责写入；查询类用对应的 procurement-* 查询 skill。
metadata:
  short-description: 飞书表格写入
  lang: zh
---

# 飞书表格写入

## Quick start

```bash
# 创建 AI 专用表
python .agents/skills/procurement-feishu-table-fill/scripts/table_fill.py create \
  --name "AI-采购线索明细" --fields "型号,品牌,品类,来源,备注,创建时间"

# dry-run 预览
python .agents/skills/procurement-feishu-table-fill/scripts/table_fill.py dry-run \
  --table "AI-采购线索明细" --data "/tmp/fill-data.json"

# 确认后写入
python .agents/skills/procurement-feishu-table-fill/scripts/table_fill.py write \
  --table "AI-采购线索明细" --data "/tmp/fill-data.json" \
  --dry-run-token "<dry_run_token>" --confirm
```

## 只处理这件事

向飞书 Base 写数据。不读业务表、不生成线索、不判断业务、不修改业务表。

输入必须是其他 skill 或人工已经整理好的结构化记录，例如 `AI-采购线索明细`。本 skill 只负责安全写表。

## 禁区

以下表禁止写入，只能读取：

- 供应商档案、查找库存、客户库存
- A/B1/B2/B3/C级供应商库存、自家库存
- 数据字典、采购询价表、客户订单审批、订单记录

禁区清单硬编码在 `table_denylist.py`。AI 只能写入 `AI-` 前缀的表。

## 流程

```
字段校验 → 禁区检查 → 表不存在则创建 → dry-run → 用户确认 → 写入
```

1. 校验目标表名以 `AI-` 开头，不在禁区。
2. 表不存在时先执行 create（需指定字段名）。
3. dry-run 展示表名、字段、行数、内容预览，并输出 `dry_run_token`。
4. 用户确认后，带同一份数据的 `dry_run_token` 才执行写入。
5. 写入前校验每条记录的字段名都在表中存在。
6. 写入采用追加记录，不做去重、不做业务合并，保留审计痕迹。

## 执行入口

```bash
# 建表（已存在则复用）
python .agents/skills/procurement-feishu-table-fill/scripts/table_fill.py create \
  --name "<AI-表名>" --fields "<字段1>,<字段2>,..."

# 预览
python .agents/skills/procurement-feishu-table-fill/scripts/table_fill.py dry-run \
  --table "<AI-表名>" --data "/tmp/fill-data.json"

# 写入（必须先 dry-run）
python .agents/skills/procurement-feishu-table-fill/scripts/table_fill.py write \
  --table "<AI-表名>" --data "/tmp/fill-data.json" \
  --dry-run-token "<dry_run_token>" --confirm

# 查看禁区清单
python .agents/skills/procurement-feishu-table-fill/scripts/table_fill.py denylist
```

## 输入格式

`--data` 接收 JSON 文件，每条记录 key 为字段名：

```json
[
  {"型号": "STM32F103C8T6", "品牌": "ST", "品类": "MCU", "来源": "Mouser", "备注": "有库存"},
  {"型号": "55A0111-24-2", "品牌": "TE", "品类": "线缆", "来源": "查找库存", "备注": "命中但需复核"}
]
```

## 输出

- dry-run：目标表、字段列表、写入行数、前5行预览、`dry_run_token`。
- write：写入行数、批次数、record_id_list。
- 错误：`{"ok": false, "error": "..."}`。

## 边界

- 不写业务表，只写 `AI-` 前缀表。
- 不跳过 dry-run，不加 `--confirm` 不会写入。
- `--dry-run-token` 必须来自同一目标表和同一份数据的 dry-run。
- 不校验业务逻辑，只校验字段名是否存在。
- 表不存在时建表字段默认 text 类型。
- 写入是 append-only batch create，不去重；去重和业务合并应由上游 skill 或人工处理。
