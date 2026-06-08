#!/usr/bin/env python3
"""Run selected procurement platform collectors."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from common import PLATFORMS, check_environment, classify_error_text, split_error_text


SCRIPT_DIR = Path(__file__).resolve().parent
PYTHON = sys.executable

# Domestic platforms are reachable directly from China and must NOT be routed
# through the overseas residential proxy (slow, costs metered traffic, and the
# residential exit may not reach CN sites well).
DOMESTIC_COLLECTORS = {"lcsc", "yunhan", "hqew"}


def parse_collectors(value: str) -> list[str]:
    names = list(PLATFORMS) if value == "all" else [name.strip() for name in value.split(",") if name.strip()]
    unknown = [name for name in names if name not in PLATFORMS]
    if unknown:
        raise SystemExit(f"unknown collector(s): {', '.join(unknown)}; choices: {', '.join(PLATFORMS)}")
    return names


def run_script(
    collector: str,
    part: str,
    *,
    headless: bool,
    proxy: str | None,
    timeout: int,
) -> dict:
    script = SCRIPT_DIR / "platforms" / f"{collector}.py"
    cmd = [PYTHON, str(script), "--part", part, "--timeout", str(timeout)]
    if not headless:
        cmd.append("--no-headless")
    if proxy:
        cmd.extend(["--proxy", proxy])
    try:
        proc = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=max(30, timeout + 25))
    except subprocess.TimeoutExpired as exc:
        stderr = exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        return {
            "collector": collector,
            "platform": PLATFORMS[collector].name,
            "status": "timeout",
            "reason": "collector_timeout",
            "error": f"collector exceeded {max(30, timeout + 25)} seconds",
            "stdout": stdout[-1200:],
            **split_error_text(stderr),
        }
    if proc.returncode != 0:
        error = classify_error_text(proc.stderr)
        return {
            "collector": collector,
            "platform": PLATFORMS[collector].name,
            **error,
            **split_error_text(proc.stderr),
        }
    try:
        payload = json.loads(proc.stdout)
        return payload["result"]
    except Exception as exc:
        return {
            "collector": collector,
            "platform": PLATFORMS[collector].name,
            "status": "parse_error",
            "error": str(exc),
            "stdout": proc.stdout[-1200:],
            "stderr": proc.stderr[-1200:],
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--part", help="Manufacturer part number to search")
    parser.add_argument("--collectors", default="mouser,digikey,newark", help="Comma-separated collector names, or all")
    parser.add_argument("--parallel", type=int, default=1, help="Number of collectors to run concurrently")
    parser.add_argument("--output", help="Write JSON result to this path")
    parser.add_argument("--list", action="store_true", help="List available collectors and exit")
    parser.add_argument("--headless", dest="headless", action="store_true", default=True)
    parser.add_argument("--no-headless", dest="headless", action="store_false")
    parser.add_argument("--proxy", help="Proxy URL, such as socks5://user:pass@host:1080")
    parser.add_argument("--timeout", type=int, default=35, help="Navigation/readiness timeout in seconds")
    parser.add_argument("--check-env", action="store_true", help="Check local browser temp prerequisites and exit")
    args = parser.parse_args()

    if args.check_env:
        print(json.dumps({"environment": check_environment()}, indent=2, ensure_ascii=False))
        return

    if args.list:
        for key, platform in PLATFORMS.items():
            print(f"{key}\t{platform.name}")
        return

    part = (args.part or "").strip()
    if not part:
        raise SystemExit("--part cannot be empty")

    collectors = parse_collectors(args.collectors)
    parallel = max(1, min(args.parallel, len(collectors)))
    default_proxy = args.proxy or os.environ.get("BROWSER_PROXY") or None

    def proxy_for(key: str) -> str | None:
        return None if key in DOMESTIC_COLLECTORS else default_proxy

    print(f"collecting {part}: {', '.join(collectors)}", file=sys.stderr)

    if parallel == 1:
        results = [
            run_script(
                key,
                part,
                headless=args.headless,
                proxy=proxy_for(key),
                timeout=args.timeout,
            )
            for key in collectors
        ]
    else:
        results_by_key = {}
        with ThreadPoolExecutor(max_workers=parallel) as executor:
            futures = {
                executor.submit(
                    run_script,
                    key,
                    part,
                    headless=args.headless,
                    proxy=proxy_for(key),
                    timeout=args.timeout,
                ): key
                for key in collectors
            }
            for future in as_completed(futures):
                results_by_key[futures[future]] = future.result()
        results = [results_by_key[key] for key in collectors]

    payload = {
        "part": part,
        "collectors": collectors,
        "parallel": parallel,
        "platforms": [PLATFORMS[key].__dict__ for key in collectors],
        "results": results,
    }
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.output}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
