#!/usr/bin/env python3
"""Protected table denylist — tables that AI must never write to."""

DENYLIST_NAMES = [
    "供应商档案",
    "查找库存",
    "客户库存",
    "A级供应商库存",
    "B级供应商库存1",
    "B级供应商库存2",
    "B级供应商库存3",
    "C级供应商库存",
    "自家库存",
    "数据字典",
    "采购询价表",
    "客户订单审批",
    "订单记录",
]

AI_TABLE_PREFIX = "AI-"


def is_denied(table_name: str) -> bool:
    return table_name in DENYLIST_NAMES


def is_ai_table(table_name: str) -> bool:
    return table_name.startswith(AI_TABLE_PREFIX)


def validate_table(table_name: str) -> None:
    if is_denied(table_name):
        raise ValueError(f"禁止写入业务表：{table_name}。AI 只能写入 AI- 前缀的专用表。")
    if not is_ai_table(table_name):
        raise ValueError(f"表名必须以 AI- 开头：{table_name}。请先创建 AI 专用表。")


def list_denied() -> list[str]:
    return list(DENYLIST_NAMES)
