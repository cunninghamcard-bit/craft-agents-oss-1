#!/usr/bin/env python3
"""Build a supplier shortlist from the Feishu supplier archive via lark-cli."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


DEFAULT_BASE_TOKEN = "Mjlkb49B9aoptssVw8Jc0wGwnhh"
SUPPLIER_TABLE_NAME = "供应商档案"
SUPPLIER_TABLE = "tblbtuMHFIOr6Oss"
SUPPLIER_VIEW = "vew2iLJ778"
BRAND_MATCH_WEIGHTS = [
    ("主营品牌", 40),
    ("优势产品", 24),
    ("备注", 10),
    ("询价品牌", 8),
]
CATEGORY_MATCH_WEIGHTS = [
    ("优势产品", 22),
    ("备注", 8),
    ("询价品牌", 4),
]
SELECT_FIELDS = [
    "供应商ID",
    "供应商全称",
    "供应商名称文本",
    "供应商类型",
    "供应商等级",
    "等级",
    "是否提供库存表",
    "官网|店铺",
    "主营品牌",
    "优势产品",
    "联系方式",
    "联系媒介",
    "供应商状态",
    "付款风险",
    "地区",
    "中国地区细分",
    "备注",
    "询价品牌",
    "最近联络时间",
    "最近交易时间",
    "特殊供应商标记",
    "移出",
]
SEARCH_FIELDS = [
    "供应商名称文本",
    "供应商全称",
    "主营品牌",
    "优势产品",
    "备注",
    "询价品牌",
]


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


def field_names(base_token: str) -> set[str]:
    payload = run_lark(
        [
            "base",
            "+field-list",
            "--base-token",
            base_token,
            "--table-id",
            SUPPLIER_TABLE,
            "--offset",
            "0",
            "--limit",
            "200",
            "--as",
            "user",
        ]
    )
    return {str(item.get("name")) for item in payload.get("data", {}).get("fields", []) if item.get("name")}


def search_keyword(base_token: str, keyword: str, valid_fields: set[str], per_keyword_limit: int) -> list[dict[str, Any]]:
    search_fields = [field for field in SEARCH_FIELDS if field in valid_fields]
    select_fields = [field for field in SELECT_FIELDS if field in valid_fields]
    request = {
        "keyword": keyword,
        "search_fields": search_fields,
        "select_fields": select_fields,
        "view_id": SUPPLIER_VIEW,
        "offset": 0,
        "limit": per_keyword_limit,
    }
    payload = run_lark(
        [
            "base",
            "+record-search",
            "--base-token",
            base_token,
            "--table-id",
            SUPPLIER_TABLE,
            "--json",
            json.dumps(request, ensure_ascii=False),
            "--format",
            "json",
            "--as",
            "user",
        ]
    )
    return rows_to_dicts(payload.get("data") or {})


def textify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(textify(item) for item in value)
    if isinstance(value, dict):
        return " ".join(textify(item) for item in value.values())
    return str(value)


def ascii_tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", value.casefold())


def field_matches_needle(value: str, needle: str) -> bool:
    needle = needle.strip()
    if not needle:
        return False
    lowered = value.casefold()
    lowered_needle = needle.casefold()
    if re.fullmatch(r"[a-z0-9]{1,3}", lowered_needle):
        tokens = ascii_tokens(lowered)
        if lowered_needle == "st":
            return any(token in {"st", "stmicroelectronics"} or re.fullmatch(r"stm32[a-z0-9]*", token) for token in tokens)
        return lowered_needle in tokens
    return lowered_needle in lowered


def weighted_match(record: dict[str, Any], field_weights: list[tuple[str, int]], needles: list[str]) -> tuple[int, list[str]]:
    matched = []
    for field, weight in field_weights:
        haystack = textify(record.get(field))
        if any(field_matches_needle(haystack, needle) for needle in needles):
            matched.append((field, weight))
    if not matched:
        return 0, []
    return max(weight for _, weight in matched), [field for field, _ in matched]


def brand_reason(fields: list[str]) -> str:
    if "主营品牌" in fields:
        return "品牌命中(主营品牌)"
    if "优势产品" in fields:
        return "品牌提及(优势产品)"
    return f"品牌弱命中({','.join(fields)})"


def category_reason(fields: list[str]) -> str:
    if "优势产品" in fields:
        return "品类命中(优势产品)"
    return f"品类弱命中({','.join(fields)})"


def score_record(record: dict[str, Any], brands: list[str], categories: list[str]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    brand_score, brand_fields = weighted_match(record, BRAND_MATCH_WEIGHTS, brands)
    if brand_fields:
        score += brand_score
        reasons.append(brand_reason(brand_fields))
    category_score, category_fields = weighted_match(record, CATEGORY_MATCH_WEIGHTS, categories)
    if category_fields:
        score += category_score
        reasons.append(category_reason(category_fields))

    supplier_type = textify(record.get("供应商类型"))
    if "原厂" in supplier_type:
        score += 24
        reasons.append("原厂")
    elif "授权" in supplier_type:
        score += 20
        reasons.append("授权代理/分销商")
    elif "平台自营" in supplier_type:
        score += 14
        reasons.append("平台自营分销商")
    elif "贸易商" in supplier_type:
        score += 8
        reasons.append("贸易商")

    grade = textify(record.get("供应商等级") or record.get("等级"))
    if "A" in grade:
        score += 15
        reasons.append("A 级")
    elif "B" in grade:
        score += 10
        reasons.append("B 级")
    elif "C" in grade:
        score += 5
        reasons.append("C 级")

    if "是" in textify(record.get("是否提供库存表")):
        score += 6
        reasons.append("提供库存表")
    if textify(record.get("联系方式")):
        score += 8
        reasons.append("联系方式可用")
    elif textify(record.get("联系媒介")):
        score += 2
        reasons.append("有联系媒介记录")
    status = textify(record.get("供应商状态"))
    if "已交易" in status:
        score += 8
        reasons.append("已交易")
    elif "已建联" in status:
        score += 6
        reasons.append("已建联")
    elif "潜在合作" in status:
        score += 3
        reasons.append("潜在合作")

    return score, reasons


def coverage_notes(candidates: list[dict[str, Any]], brands: list[str], categories: list[str]) -> list[str]:
    notes: list[str] = []
    if not candidates:
        return ["未找到可展示候选，需补充品牌/品类信息或人工查找供应商。"]
    reasons = [reason for item in candidates for reason in item.get("fit_reasons", [])]
    if brands and not any(reason == "品牌命中(主营品牌)" for reason in reasons):
        notes.append("未找到主营品牌直接命中的候选；当前品牌线索主要来自优势产品、备注或历史询价。")
    if any(reason.startswith("品牌弱命中(") for reason in reasons):
        notes.append("部分候选仅为备注或历史询价弱命中，不能当作品牌直连供应商。")
    if categories and not any(reason == "品类命中(优势产品)" for reason in reasons):
        notes.append("未找到优势产品直接覆盖该品类的候选；当前品类线索较弱。")
    return notes


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "record_id",
        "供应商ID",
        "供应商名称文本",
        "供应商全称",
        "供应商类型",
        "供应商等级",
        "等级",
        "主营品牌",
        "优势产品",
        "联系方式",
        "联系媒介",
        "供应商状态",
        "是否提供库存表",
        "官网|店铺",
        "地区",
        "付款风险",
        "备注",
        "询价品牌",
        "最近联络时间",
        "最近交易时间",
    ]
    return {key: record.get(key) for key in keys if key in record and record.get(key) not in (None, "", [])}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-token", default=DEFAULT_BASE_TOKEN)
    parser.add_argument("--brand", action="append", default=[])
    parser.add_argument("--category", action="append", default=[])
    parser.add_argument("--keyword", action="append", default=[])
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--per-keyword-limit", type=int, default=80)
    parser.add_argument("--output")
    args = parser.parse_args()

    brands = [item.strip() for item in args.brand if item.strip()]
    categories = [item.strip() for item in args.category if item.strip()]
    keywords = []
    for item in [*brands, *categories, *args.keyword]:
        item = item.strip()
        if item and item not in keywords:
            keywords.append(item)
    if not keywords:
        raise SystemExit("provide --brand, --category, or --keyword")

    try:
        valid_fields = field_names(args.base_token)
        records_by_id: dict[str, dict[str, Any]] = {}
        for keyword in keywords:
            for record in search_keyword(args.base_token, keyword, valid_fields, args.per_keyword_limit):
                key = textify(record.get("record_id") or record.get("供应商ID") or record.get("供应商名称文本"))
                if key:
                    records_by_id[key] = {**records_by_id.get(key, {}), **record}
        candidates = []
        for record in records_by_id.values():
            if textify(record.get("移出")).lower() in {"true", "是", "1"}:
                continue
            score, reasons = score_record(record, brands, categories)
            if score <= 0:
                continue
            candidates.append(
                {
                    "fit_score": score,
                    "fit_reasons": reasons,
                    "supplier": compact_record(record),
                }
            )
        candidates.sort(key=lambda item: item["fit_score"], reverse=True)
        payload = {
            "brand_inputs": brands,
            "category_inputs": categories,
            "keywords": keywords,
            "table": SUPPLIER_TABLE_NAME,
            "table_id": SUPPLIER_TABLE,
            "view": SUPPLIER_VIEW,
            "candidate_count": len(candidates),
            "candidates": candidates[: args.limit],
            "coverage_notes": coverage_notes(candidates, brands, categories),
            "decision_boundary": "候选只代表可联系供应商线索，不代表有库存、准入通过、价格合适或可以下单。",
            "manual_confirmation_items": [
                "是否仍在合作",
                "是否可供该型号或该品牌品类",
                "是否有现货和有效报价",
                "是否需要补授权、来源或交易材料",
            ],
        }
    except LarkError as exc:
        payload = {"ok": False, "error": str(exc), "keywords": keywords}

    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    if payload.get("ok") is False:
        sys.exit(1)


if __name__ == "__main__":
    main()
