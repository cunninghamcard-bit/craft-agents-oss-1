---
name: procurement-feishu-table-fill
description: 把采购线索或分析结果写入飞书 Base 的 AI 专用表，含建表、字段校验、dry-run 预览和用户确认。当用户说“把结果填进表/写到飞书表格/录入这些数据”，需要把前面查到的型号、报价、库存、供应商结果落库时使用。只负责写入；查询类用对应的 procurement-* 查询 skill。
metadata:
  short-description: 飞书表格写入
  lang: zh
---

# 飞书表格写入

把其他 skill 或人工整理好的结构化记录，用 `lark-cli base` 写入飞书 Base 的 `AI-` 前缀表。只写，不读业务表、不生成线索、不判断业务。

## 写入安全（硬规则，必须照做）

- **只能写表名以 `AI-` 开头的表。**
- **禁止写任何业务表**：供应商档案、查找库存、客户库存、A/B1/B2/B3/C级供应商库存、自家库存、数据字典、采购询价表、客户订单审批、订单记录。
- 流程：校验表名（`AI-` 前缀且不在禁区）→ 表不存在先建表 → **dry-run 预览给用户确认** → 用户确认后才正式写 → append-only（不去重、不合并，保留审计痕迹）。
- 写前确认每条记录的字段名都在表里。

## 怎么写（lark-cli base，base-token `Mjlkb49B9aoptssVw8Jc0wGwnhh`）

1. **建表**（仅当该 `AI-` 表不存在；`type:1` = 文本字段）：

       lark-cli base +table-create --base-token Mjlkb49B9aoptssVw8Jc0wGwnhh --name "AI-采购线索明细" --fields '[{"field_name":"型号","type":1},{"field_name":"品牌","type":1},{"field_name":"来源","type":1},{"field_name":"备注","type":1}]'

2. **dry-run 预览**（务必先做，把目标表/字段/行数/内容给用户看，等用户确认）：

       lark-cli base +record-batch-create --base-token Mjlkb49B9aoptssVw8Jc0wGwnhh --table-id "AI-采购线索明细" --json '{"fields":["型号","品牌","来源","备注"],"rows":[["STM32F103C8T6","ST","Mouser","有库存"]]}' --dry-run

3. **用户确认后正式写**（去掉 `--dry-run`，其余不变）。

`--table-id` 可直接用表名（`AI-xxx`）。`--json` 形状：`{"fields":[字段名...],"rows":[[与字段同序的值...], ...]}`。

## 边界

- 不写业务表，不跳 dry-run，未确认不写。
- append-only 批量追加，不去重；去重/业务合并交上游 skill 或人工。
- 只校验字段名是否存在，不校验业务逻辑；建表字段默认文本。
- 权限/scope 或登录失效错误**如实报告**（写需 `base:record:create` / `base:table:create` 权限），不要假装写成功。
