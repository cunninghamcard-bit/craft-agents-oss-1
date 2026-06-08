#!/usr/bin/env python3
"""Write data to Feishu Base AI-dedicated tables with dry-run and confirmation.

Flow:
  1. Denylist check — reject writes to business tables
  2. AI table creation — create AI- prefixed tables on demand
  3. Field validation — reject unknown field names
  4. Dry-run — display what will be written and save a receipt token
  5. Confirm — user approval plus matching dry-run token before actual write
  6. Write — batch-create append-only records
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from table_denylist import validate_table, list_denied, AI_TABLE_PREFIX

DEFAULT_WIKI_URL = "https://pcn6r1o1u3g6.feishu.cn/wiki/X2zgwdBOsiv52CkOcCPcwV7mn8f"
DEFAULT_BASE_TOKEN = "Mjlkb49B9aoptssVw8Jc0wGwnhh"
RECEIPT_DIR = Path(os.environ.get("PROCUREMENT_TABLE_FILL_RECEIPT_DIR", "/tmp/procurement-feishu-table-fill"))
MAX_BATCH_ROWS = 200


def run_lark(args: list[str]) -> dict:
    proc = subprocess.run(["lark-cli", *args], check=False, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout)[-2000:])
    text = proc.stdout.strip()
    start = text.find("{")
    if start > 0:
        text = text[start:]
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"lark-cli JSON parse failed: {exc}") from exc
    if not payload.get("ok"):
        raise RuntimeError(json.dumps(payload.get("error", payload), ensure_ascii=False))
    return payload


def resolve_base_token(base_token: str, wiki_url: str) -> str:
    if base_token:
        return base_token
    payload = run_lark(["wiki", "+node-get", "--node-token", wiki_url, "--format", "json", "--as", "user"])
    data = payload.get("data") or {}
    if data.get("obj_type") != "bitable" or not data.get("obj_token"):
        raise RuntimeError(f"wiki node is not a bitable: {data}")
    return str(data["obj_token"])


def table_exists(base_token: str, table_name: str) -> dict | None:
    payload = run_lark(
        ["base", "+table-list", "--base-token", base_token, "--offset", "0", "--limit", "100", "--as", "user"]
    )
    data = payload.get("data", {})
    tables = data.get("tables") or data.get("items") or []
    for t in tables:
        if t.get("name") == table_name:
            return t
    return None


def extract_table_id(table: dict) -> str:
    table_id = table.get("id") or table.get("table_id")
    if not table_id:
        raise RuntimeError(f"无法从表信息中读取 table_id：{table}")
    return str(table_id)


def create_table(base_token: str, table_name: str, fields: list[str]) -> dict:
    """Create a new table with default text fields."""
    if not table_name.startswith(AI_TABLE_PREFIX):
        raise ValueError(f"AI 专用表必须以 {AI_TABLE_PREFIX} 开头，当前表名：{table_name}")

    existing = table_exists(base_token, table_name)
    if existing:
        return {"created": False, "table_id": extract_table_id(existing), "table_name": table_name, "message": "表已存在"}

    create_fields = [{"name": field_name, "type": "text"} for field_name in fields]
    payload = run_lark(
        [
            "base", "+table-create", "--base-token", base_token,
            "--name", table_name,
            "--fields", json.dumps(create_fields, ensure_ascii=False),
            "--as", "user",
        ]
    )
    data = payload.get("data", {})
    table = data.get("table") if isinstance(data.get("table"), dict) else {}
    table_id = table.get("id") or table.get("table_id") or data.get("table_id") or data.get("id")
    if not table_id:
        refreshed = table_exists(base_token, table_name)
        if refreshed:
            table_id = extract_table_id(refreshed)
    if not table_id:
        raise RuntimeError(f"建表成功但无法读取 table_id：{data}")
    return {"created": True, "table_id": table_id, "table_name": table_name, "fields": fields}


def get_table_fields(base_token: str, table_id: str) -> list[str]:
    payload = run_lark(
        ["base", "+field-list", "--base-token", base_token, "--table-id", table_id,
         "--offset", "0", "--limit", "200", "--as", "user"]
    )
    field_items = payload.get("data", {}).get("fields", [])
    return [str(f.get("name")) for f in field_items if f.get("name")]


def validate_fields(records: list[dict], valid_fields: list[str]) -> list[str]:
    invalid: list[str] = []
    for record in records:
        for key in record:
            if key not in valid_fields:
                invalid.append(key)
    return list(set(invalid))


def load_records(data_path: str) -> list[dict]:
    payload = json.loads(Path(data_path).read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        records = [payload]
    elif isinstance(payload, list):
        records = payload
    else:
        raise ValueError("--data 必须是 JSON 对象或对象数组")

    if not records:
        raise ValueError("--data 至少需要包含一条记录")
    for i, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            raise ValueError(f"第 {i} 条记录不是 JSON 对象")
        for key in record:
            if not isinstance(key, str) or not key:
                raise ValueError(f"第 {i} 条记录包含非法字段名：{key!r}")
    return records


def fields_for_records(records: list[dict]) -> list[str]:
    fields: list[str] = []
    seen: set[str] = set()
    for record in records:
        for key in record:
            if key not in seen:
                seen.add(key)
                fields.append(key)
    if not fields:
        raise ValueError("记录中没有可写字段")
    return fields


def records_digest(base_token: str, table_id: str, table_name: str, records: list[dict], fields: list[str]) -> str:
    body = {
        "base_token": base_token,
        "table_id": table_id,
        "table_name": table_name,
        "fields": fields,
        "records": records,
    }
    encoded = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def receipt_path(token: str) -> Path:
    return RECEIPT_DIR / f"{token}.json"


def write_dry_run_receipt(
    token: str,
    base_token: str,
    table_id: str,
    table_name: str,
    records: list[dict],
    fields: list[str],
) -> Path:
    RECEIPT_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = receipt_path(token)
    receipt = {
        "dry_run_token": token,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "base_token": base_token,
        "table_id": table_id,
        "table_name": table_name,
        "fields": fields,
        "row_count": len(records),
        "preview": records[:5],
    }
    path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def verify_dry_run_receipt(token: str, expected_token: str) -> None:
    if not token:
        raise ValueError("必须先 dry-run，并把输出中的 dry_run_token 用 --dry-run-token 传入。")
    if token != expected_token:
        raise ValueError("dry-run token 与当前表名或数据不匹配，请重新 dry-run。")
    path = receipt_path(token)
    if not path.exists():
        raise ValueError("找不到 dry-run receipt，请重新 dry-run 后再写入。")
    receipt = json.loads(path.read_text(encoding="utf-8"))
    if receipt.get("dry_run_token") != expected_token:
        raise ValueError("dry-run receipt 内容不匹配，请重新 dry-run。")


def dry_run_display(table_name: str, records: list[dict], valid_fields: list[str]) -> str:
    lines = [
        f"目标表：{table_name}",
        f"表字段：{', '.join(valid_fields)}",
        f"写入行数：{len(records)}",
        "---",
    ]
    for i, record in enumerate(records[:5]):
        lines.append(f"第 {i+1} 行：{json.dumps(record, ensure_ascii=False)}")
    if len(records) > 5:
        lines.append(f"...另有 {len(records) - 5} 行")
    return "\n".join(lines)


def write_records(base_token: str, table_id: str, table_name: str, records: list[dict], fields: list[str]) -> dict:
    field_names = get_table_fields(base_token, table_id)
    invalid = validate_fields(records, field_names)
    if invalid:
        raise ValueError(f"字段不存在：{', '.join(invalid)}。表中可用字段：{', '.join(field_names)}")

    record_ids: list[str] = []
    batches = 0
    for start in range(0, len(records), MAX_BATCH_ROWS):
        batch = records[start:start + MAX_BATCH_ROWS]
        request = {
            "fields": fields,
            "rows": [[record.get(field) for field in fields] for record in batch],
        }
        payload = run_lark(
            [
                "base", "+record-batch-create", "--base-token", base_token, "--table-id", table_id,
                "--json", json.dumps(request, ensure_ascii=False),
                "--as", "user",
            ]
        )
        batches += 1
        result = payload.get("data", {})
        ids = result.get("record_id_list") or result.get("record_ids") or []
        record_ids.extend(str(record_id) for record_id in ids)

    return {
        "written": len(records),
        "table_name": table_name,
        "batches": batches,
        "record_id_list": record_ids,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)

    create_parser = sub.add_parser("create", help="Create AI-dedicated table")
    create_parser.add_argument("--name", required=True, help="Table name (must start with AI-)")
    create_parser.add_argument("--fields", required=True, help="Comma-separated field names")
    create_parser.add_argument("--base-token", default=DEFAULT_BASE_TOKEN)
    create_parser.add_argument("--wiki-url", default=DEFAULT_WIKI_URL)

    dryrun_parser = sub.add_parser("dry-run", help="Preview what will be written")
    dryrun_parser.add_argument("--table", required=True, help="Target table name")
    dryrun_parser.add_argument("--data", required=True, help="JSON file with records to write")
    dryrun_parser.add_argument("--base-token", default=DEFAULT_BASE_TOKEN)
    dryrun_parser.add_argument("--wiki-url", default=DEFAULT_WIKI_URL)

    write_parser = sub.add_parser("write", help="Write records (requires --confirm)")
    write_parser.add_argument("--table", required=True, help="Target table name")
    write_parser.add_argument("--data", required=True, help="JSON file with records to write")
    write_parser.add_argument("--confirm", action="store_true", help="Confirm write after dry-run")
    write_parser.add_argument("--dry-run-token", default="", help="Token printed by dry-run for the same table and data")
    write_parser.add_argument("--base-token", default=DEFAULT_BASE_TOKEN)
    write_parser.add_argument("--wiki-url", default=DEFAULT_WIKI_URL)

    sub.add_parser("denylist", help="List protected tables that AI must not write to")

    args = parser.parse_args()

    try:
        if args.action == "denylist":
            print(json.dumps({"denylist": list_denied()}, ensure_ascii=False, indent=2))
            return

        base_token = resolve_base_token(args.base_token, args.wiki_url)

        if args.action == "create":
            validate_table(args.name)
            fields = [f.strip() for f in args.fields.split(",") if f.strip()]
            if not fields:
                raise ValueError("至少需要指定一个字段")
            result = create_table(base_token, args.name, fields)
            print(json.dumps(result, ensure_ascii=False, indent=2))

        elif args.action == "dry-run":
            validate_table(args.table)
            existing = table_exists(base_token, args.table)
            if not existing:
                raise ValueError(f"表不存在：{args.table}。请先 create。")
            table_id = extract_table_id(existing)
            records = load_records(args.data)
            field_names = get_table_fields(base_token, table_id)
            invalid = validate_fields(records, field_names)
            if invalid:
                raise ValueError(f"字段不存在：{', '.join(invalid)}。表中可用字段：{', '.join(field_names)}")
            fields = fields_for_records(records)
            token = records_digest(base_token, table_id, args.table, records, fields)
            path = write_dry_run_receipt(token, base_token, table_id, args.table, records, fields)
            print(dry_run_display(args.table, records, field_names))
            print("---")
            print(json.dumps({"dry_run_token": token, "receipt_path": str(path)}, ensure_ascii=False, indent=2))

        elif args.action == "write":
            if not args.confirm:
                raise ValueError("必须先 dry-run，确认后加 --confirm 写入。")
            validate_table(args.table)
            existing = table_exists(base_token, args.table)
            if not existing:
                raise ValueError(f"表不存在：{args.table}。请先 create。")
            table_id = extract_table_id(existing)
            records = load_records(args.data)
            fields = fields_for_records(records)
            token = records_digest(base_token, table_id, args.table, records, fields)
            verify_dry_run_receipt(args.dry_run_token, token)
            result = write_records(base_token, table_id, args.table, records, fields)
            print(json.dumps(result, ensure_ascii=False, indent=2))

    except (ValueError, RuntimeError, FileNotFoundError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
