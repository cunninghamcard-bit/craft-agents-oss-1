#!/usr/bin/env python3
"""Lookup procurement inventory from the Feishu Base through lark-cli."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


DEFAULT_WIKI_URL = "https://pcn6r1o1u3g6.feishu.cn/wiki/X2zgwdBOsiv52CkOcCPcwV7mn8f"
DEFAULT_BASE_TOKEN = "Mjlkb49B9aoptssVw8Jc0wGwnhh"
LOOKUP_TABLE = {"id": "tbl9I8ZWFwCMlxNm", "name": "查找库存"}
SOURCE_TABLES = [
    {"id": "tblzQbSnVNhGszYA", "name": "A级供应商库存"},
    {"id": "tbldOthm6zmFonDM", "name": "B级供应商库存1"},
    {"id": "tblqaoi5UuUGybxF", "name": "B级供应商库存2"},
    {"id": "tbld53dBj2dvI1R6", "name": "B级供应商库存3"},
    {"id": "tblBbvvRKB0Ziioz", "name": "C级供应商库存"},
    {"id": "tblSUjXdehzkxIbK", "name": "自家库存"},
]
LOOKUP_FIELDS = [
    "型号",
    "自家库存",
    "数量",
    "A供应商",
    "A库存数量",
    "A单价",
    "B1供应商",
    "B1库存数量",
    "B1单价",
    "B2供应商",
    "B2数量",
    "B2单价",
    "B3供应商",
    "B3数量",
    "B3单价",
    "C供应商",
    "C库存数量",
    "C单价",
    "动态库存",
    "动态库存数量",
    "动态库存单价",
]
SOURCE_FIELD_CANDIDATES = [
    "型号",
    "品牌",
    "供应商名称",
    "供应商",
    "库存数量",
    "数量",
    "单价",
    "SPQ",
    "MOQ",
    "更新时间",
    "备注",
]
STATUS_LABELS = {
    "hit_with_stock": "有库存",
    "hit_needs_review": "命中但需复核",
    "hit_no_stock_signal": "命中但未见明确库存",
    "no_hit": "未查到库存",
    "query_failed": "查询失败",
}


class LarkError(RuntimeError):
    pass


def is_rate_limited(payload_or_text: Any) -> bool:
    if isinstance(payload_or_text, dict):
        error = payload_or_text.get("error") or {}
        return error.get("code") == 800004135 or "limited" in str(error.get("message", "")).lower()
    return "OpenAPISearchRecord limited" in str(payload_or_text) or " limited" in str(payload_or_text).lower()


def run_lark(args: list[str]) -> dict[str, Any]:
    delays = [0, 2, 5, 10]
    last_error = ""
    for attempt, delay in enumerate(delays):
        if delay:
            time.sleep(delay)
        proc = subprocess.run(["lark-cli", *args], check=False, capture_output=True, text=True)
        if proc.returncode != 0:
            last_error = (proc.stderr or proc.stdout)[-2000:]
            if attempt < len(delays) - 1 and is_rate_limited(last_error):
                continue
            raise LarkError(last_error)
        text = proc.stdout.strip()
        start = text.find("{")
        if start > 0:
            text = text[start:]
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise LarkError(f"cannot parse lark-cli JSON: {exc}; output={proc.stdout[-1200:]}") from exc
        if payload.get("ok", False):
            return payload
        last_error = json.dumps(payload.get("error", payload), ensure_ascii=False)
        if attempt < len(delays) - 1 and is_rate_limited(payload):
            continue
        raise LarkError(last_error)
    raise LarkError(last_error or "lark-cli failed")


def resolve_base_token(base_token: str, wiki_url: str) -> str:
    if base_token:
        return base_token
    payload = run_lark(["wiki", "+node-get", "--node-token", wiki_url, "--format", "json", "--as", "user"])
    data = payload.get("data") or {}
    if data.get("obj_type") != "bitable" or not data.get("obj_token"):
        raise LarkError(f"wiki node is not a bitable: {data}")
    return str(data["obj_token"])


def rows_to_dicts(data: dict[str, Any]) -> list[dict[str, Any]]:
    fields = data.get("fields") or []
    rows = data.get("data") or []
    record_ids = data.get("record_id_list") or []
    out: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        item = {str(field): row[pos] if pos < len(row) else None for pos, field in enumerate(fields)}
        if index < len(record_ids):
            item["record_id"] = record_ids[index]
        out.append(item)
    return out


def record_search(
    base_token: str,
    table_id: str,
    table_name: str,
    part: str,
    select_fields: list[str],
    limit: int,
) -> dict[str, Any]:
    request = {
        "keyword": part,
        "search_fields": ["型号"],
        "select_fields": select_fields,
        "offset": 0,
        "limit": limit,
    }
    payload = run_lark(
        [
            "base",
            "+record-search",
            "--base-token",
            base_token,
            "--table-id",
            table_id,
            "--json",
            json.dumps(request, ensure_ascii=False),
            "--format",
            "json",
            "--as",
            "user",
        ]
    )
    data = payload.get("data") or {}
    return {
        "table": table_name,
        "table_id": table_id,
        "fields": data.get("fields", []),
        "records": rows_to_dicts(data),
        "has_more": data.get("has_more", False),
        "query_context": data.get("query_context", {}),
    }


def table_fields(base_token: str, table_id: str) -> list[str]:
    payload = run_lark(
        [
            "base",
            "+field-list",
            "--base-token",
            base_token,
            "--table-id",
            table_id,
            "--offset",
            "0",
            "--limit",
            "200",
            "--as",
            "user",
        ]
    )
    fields = payload.get("data", {}).get("fields", [])
    return [str(item.get("name")) for item in fields if item.get("name")]


def search_source_table(base_token: str, table: dict[str, str], part: str, limit: int) -> dict[str, Any]:
    names = table_fields(base_token, table["id"])
    if "型号" not in names:
        return {"table": table["name"], "table_id": table["id"], "error": "missing 型号 field", "records": []}
    select_fields = [field for field in SOURCE_FIELD_CANDIDATES if field in names]
    return record_search(base_token, table["id"], table["name"], part, select_fields, limit)


def flatten_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(flatten_values(item))
        return out
    if isinstance(value, dict):
        for key in ("text", "name", "value", "en_us", "zh_cn"):
            if key in value:
                return flatten_values(value[key])
        out = []
        for item in value.values():
            out.extend(flatten_values(item))
        return out
    text = str(value).strip()
    return [text] if text else []


def display_value(value: Any) -> str:
    values = flatten_values(value)
    return "、".join(values) if values else "未提供"


def normalize_model(value: str) -> str:
    return value.strip().casefold()


def record_models(record: dict[str, Any]) -> list[str]:
    return flatten_values(record.get("型号"))


def record_has_exact_model(record: dict[str, Any], part: str) -> bool:
    expected = normalize_model(part)
    return any(normalize_model(model) == expected for model in record_models(record))


def record_has_stock(record: dict[str, Any], stock_fields: list[str]) -> bool:
    return any(has_stock_value(record.get(field)) for field in stock_fields)


def has_stock_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value > 0
    if isinstance(value, list):
        return any(has_stock_value(item) for item in value)
    text = str(value).strip()
    if not text:
        return False
    return text not in {"0", "0.0", "-", "无", "暂无", "null"}


def summarize_records(records: list[dict[str, Any]], part: str, stock_fields: list[str]) -> dict[str, Any]:
    exact_record_count = 0
    variant_record_count = 0
    variant_models: list[str] = []
    has_stock = False
    has_exact_stock = False
    has_variant_stock = False
    for record in records:
        exact = record_has_exact_model(record, part)
        stock = record_has_stock(record, stock_fields)
        if exact:
            exact_record_count += 1
        else:
            variant_record_count += 1
            for model in record_models(record):
                if normalize_model(model) != normalize_model(part) and model not in variant_models:
                    variant_models.append(model)
        has_stock = has_stock or stock
        has_exact_stock = has_exact_stock or (exact and stock)
        has_variant_stock = has_variant_stock or ((not exact) and stock)

    if has_exact_stock:
        status = "hit_with_stock"
    elif has_variant_stock or (records and variant_record_count and not exact_record_count):
        status = "hit_needs_review"
    elif records:
        status = "hit_no_stock_signal"
    else:
        status = "no_hit"

    return {
        "record_count": len(records),
        "exact_record_count": exact_record_count,
        "variant_record_count": variant_record_count,
        "variant_models": variant_models,
        "has_stock_signal": has_stock,
        "has_exact_stock_signal": has_exact_stock,
        "has_variant_stock_signal": has_variant_stock,
        "status": status,
    }


def summarize_lookup(records: list[dict[str, Any]], part: str) -> dict[str, Any]:
    stock_fields = [
        "自家库存",
        "数量",
        "A库存数量",
        "B1库存数量",
        "B2数量",
        "B3数量",
        "C库存数量",
        "动态库存数量",
    ]
    return summarize_records(records, part, stock_fields)


def summarize_sources(sources: list[dict[str, Any]], part: str) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    tables_with_records: list[str] = []
    for source in sources:
        source_records = source.get("records") or []
        if source_records:
            tables_with_records.append(str(source.get("table", "")))
        records.extend(source_records)
    summary = summarize_records(records, part, ["库存数量", "数量"])
    summary["tables_with_records"] = [table for table in tables_with_records if table]
    return summary


def choose_overall_status(lookup_summary: dict[str, Any], source_summary: dict[str, Any], checked_sources: bool) -> str:
    if lookup_summary["status"] == "hit_with_stock":
        return "hit_with_stock"
    if checked_sources and source_summary["status"] == "hit_with_stock":
        return "hit_with_stock"
    if lookup_summary["status"] == "hit_needs_review":
        return "hit_needs_review"
    if checked_sources and source_summary["status"] == "hit_needs_review":
        return "hit_needs_review"
    if checked_sources and source_summary["status"] == "hit_no_stock_signal":
        return source_summary["status"]
    return lookup_summary["status"]


def lookup_inventory_entries(records: list[dict[str, Any]], part: str) -> list[dict[str, Any]]:
    groups = [
        ("A供应商", "A库存数量", "A单价", "A级/查找库存"),
        ("B1供应商", "B1库存数量", "B1单价", "B1/查找库存"),
        ("B2供应商", "B2数量", "B2单价", "B2/查找库存"),
        ("B3供应商", "B3数量", "B3单价", "B3/查找库存"),
        ("C供应商", "C库存数量", "C单价", "C级/查找库存"),
        ("动态库存", "动态库存数量", "动态库存单价", "动态库存/查找库存"),
    ]
    entries: list[dict[str, Any]] = []
    for record in records:
        model = display_value(record.get("型号"))
        for supplier_field, qty_field, price_field, source in groups:
            if has_stock_value(record.get(qty_field)) or flatten_values(record.get(supplier_field)):
                entries.append(
                    {
                        "model": model,
                        "supplier": display_value(record.get(supplier_field)),
                        "quantity": display_value(record.get(qty_field)),
                        "unit_price": display_value(record.get(price_field)),
                        "source": source,
                        "exact_model": record_has_exact_model(record, part),
                    }
                )
    return entries


def source_inventory_entries(sources: list[dict[str, Any]], part: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for source in sources:
        table = str(source.get("table") or "")
        for record in source.get("records") or []:
            entries.append(
                {
                    "model": display_value(record.get("型号")),
                    "brand": display_value(record.get("品牌")),
                    "supplier": display_value(record.get("供应商名称") or record.get("供应商")),
                    "quantity": display_value(record.get("库存数量") or record.get("数量")),
                    "unit_price": display_value(record.get("单价")),
                    "source": table,
                    "spq": display_value(record.get("SPQ")),
                    "moq": display_value(record.get("MOQ")),
                    "note": display_value(record.get("备注")),
                    "exact_model": record_has_exact_model(record, part),
                }
            )
    return entries


def self_inventory_text(payload: dict[str, Any]) -> str:
    values: list[str] = []
    for record in payload.get("lookup_table", {}).get("records") or []:
        if has_stock_value(record.get("自家库存")):
            values.append(display_value(record.get("自家库存")))
    for source in payload.get("source_tables") or []:
        if source.get("table") != "自家库存":
            continue
        for record in source.get("records") or []:
            quantity = display_value(record.get("库存数量") or record.get("数量"))
            if quantity != "未提供":
                values.append(quantity)
    return "、".join(values) if values else "未查到"


def confirmation_text(payload: dict[str, Any]) -> str:
    status = payload.get("overall_status")
    variants = []
    for summary_key in ("lookup_summary", "source_summary"):
        for model in payload.get(summary_key, {}).get("variant_models") or []:
            if model not in variants:
                variants.append(model)
    if status == "hit_needs_review":
        suffix = f"（命中型号：{'、'.join(variants)}）" if variants else ""
        return "库存命中型号与查询型号不完全一致，需确认型号差异是否可接受" + suffix
    if status == "hit_with_stock":
        return "库存仅作为线索展示，供应商、价格和可下单性仍需采购确认"
    if status == "hit_no_stock_signal":
        return "有记录但无明确库存数量，需供应商或表格维护人确认数量"
    if status == "no_hit":
        return "本地库存未查到，可作为平台线索查找和供应商候选筛选的组合输入"
    return payload.get("message", "需要检查飞书查询状态")


def render_text(payload: dict[str, Any]) -> str:
    part = payload.get("part", "")
    if payload.get("ok") is False:
        return "\n".join(
            [
                "本地库存：",
                f"- 查询型号：{part}",
                "- 命中情况：查询失败",
                "- 资料来源：查找库存",
                f"- 需要人工确认：{payload.get('message', '飞书查询失败')}",
            ]
        )

    status = payload.get("overall_status", "no_hit")
    source = "查找库存 + 源表复核" if payload.get("source_tables_checked") else "查找库存"
    entries = source_inventory_entries(payload.get("source_tables") or [], part)
    if not entries:
        entries = lookup_inventory_entries(payload.get("lookup_table", {}).get("records") or [], part)

    lines = [
        "本地库存：",
        f"- 查询型号：{part}",
        f"- 命中情况：{STATUS_LABELS.get(status, status)}",
        f"- 自家库存：{self_inventory_text(payload)}",
        "- 供应商库存：",
    ]
    stock_entries = [entry for entry in entries if entry["source"] != "自家库存"]
    if stock_entries:
        for entry in stock_entries[:10]:
            model_note = "" if entry.get("exact_model") else f"；命中型号：{entry.get('model', '未提供')}"
            lines.append(
                f"  - 供应商：{entry.get('supplier', '未提供')}；来源表：{entry.get('source', '未提供')}"
                f"{model_note}；数量：{entry.get('quantity', '未提供')}；单价：{entry.get('unit_price', '未提供')}"
            )
        if len(stock_entries) > 10:
            lines.append(f"  - 另有 {len(stock_entries) - 10} 条库存记录未展开")
    else:
        lines.append("  - 未查到供应商库存")
    lines.extend(
        [
            f"- 资料来源：{source}",
            f"- 需要人工确认：{confirmation_text(payload)}",
        ]
    )
    return "\n".join(lines)


def sanitize_lark_error(error: str) -> dict[str, str]:
    text = str(error)
    lowered = text.lower()
    if "openapisearchrecord limited" in lowered or "rate" in lowered and "limit" in lowered:
        return {"error_type": "rate_limited", "message": "飞书库存查询被限流，请稍后重试"}
    if "lookup open.feishu.cn" in lowered or "socket: operation not permitted" in lowered:
        return {"error_type": "network_unavailable", "message": "当前环境无法访问飞书接口，请检查网络或沙箱权限"}
    if "permission" in lowered or "unauthorized" in lowered or "forbidden" in lowered:
        return {"error_type": "permission_denied", "message": "飞书权限不足或登录状态失效，请重新授权后再查"}
    return {"error_type": "feishu_query_failed", "message": "飞书库存查询失败，请稍后重试或人工打开表格确认"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--part", required=True, help="Part number/model to lookup")
    parser.add_argument("--base-token", default=DEFAULT_BASE_TOKEN)
    parser.add_argument("--wiki-url", default=DEFAULT_WIKI_URL)
    parser.add_argument("--include-source", action="store_true", help="Also search A/B/C/self inventory source tables")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--source-limit", type=int, default=20)
    parser.add_argument("--format", choices=["text", "json"], default="text")
    parser.add_argument("--output")
    args = parser.parse_args()

    part = args.part.strip()
    if not part:
        raise SystemExit("--part cannot be empty")

    try:
        base_token = resolve_base_token(args.base_token, args.wiki_url)
        lookup = record_search(base_token, LOOKUP_TABLE["id"], LOOKUP_TABLE["name"], part, LOOKUP_FIELDS, args.limit)
        lookup_summary = summarize_lookup(lookup["records"], part)
        sources = []
        if args.include_source or lookup_summary["status"] != "hit_with_stock":
            for table in SOURCE_TABLES:
                sources.append(search_source_table(base_token, table, part, args.source_limit))
        source_summary = summarize_sources(sources, part)
        checked_sources = bool(sources)
        payload = {
            "ok": True,
            "part": part,
            "lookup_table": lookup,
            "lookup_summary": lookup_summary,
            "source_tables_checked": checked_sources,
            "source_summary": source_summary,
            "overall_status": choose_overall_status(lookup_summary, source_summary, checked_sources),
            "source_tables": sources,
        }
    except LarkError as exc:
        payload = {"part": part, "ok": False, **sanitize_lark_error(str(exc))}

    text = json.dumps(payload, indent=2, ensure_ascii=False) if args.format == "json" else render_text(payload)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    if payload.get("ok") is False:
        sys.exit(1)


if __name__ == "__main__":
    main()
