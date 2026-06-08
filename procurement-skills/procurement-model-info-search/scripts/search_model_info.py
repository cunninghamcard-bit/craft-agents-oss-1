#!/usr/bin/env python3
"""Find public model information for a single procurement part number."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

from playwright.sync_api import sync_playwright

_pw = sync_playwright().start()


def launch_browser(*, headless=True, proxy=None):
    kwargs = {"headless": headless}
    if proxy:
        kwargs["proxy"] = {"server": proxy}
    return _pw.chromium.launch(**kwargs)


INFO_TERMS = (
    "datasheet",
    "data sheet",
    "product",
    "specification",
    "ordering",
    "part numbering",
    "package",
    "lifecycle",
    "drawing",
    "rohs",
    "reach",
    "数据手册",
    "规格书",
    "产品页",
    "订货",
    "封装",
)

MANUFACTURER_HINTS = (
    "manufacturer",
    "mfr",
    "brand",
    "原厂",
    "制造商",
    "品牌",
)


def compact(value: str) -> str:
    return " ".join(value.split())


def clean_result_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path == "/l/":
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        if target:
            return unquote(target)
    return url


def is_search_ad_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.endswith("/y.js"):
        return True
    return "ad_domain=" in parsed.query or "ad_provider=" in parsed.query


def normalize(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", value).lower()


def classify(url: str, title: str, snippet: str) -> list[str]:
    text = f"{url} {title} {snippet}".lower()
    tags: set[str] = set()
    if ".pdf" in text or "pdf" in text:
        tags.add("pdf")
    if any(term in text for term in ("datasheet", "data sheet", "数据手册")):
        tags.add("datasheet")
    if any(term in text for term in ("product", "产品页", "part detail")):
        tags.add("product-page")
    if any(term in text for term in ("ordering", "part numbering", "订货")):
        tags.add("ordering")
    if any(term in text for term in ("package", "封装", "packaging")):
        tags.add("package")
    if any(term in text for term in ("lifecycle", "obsolete", "active", "nrnd", "eol", "停产")):
        tags.add("lifecycle")
    if re.search(r"\b(mouser|digikey|newark|arrow|avnet|rs-online|tme|lcsc)\b", text):
        tags.add("distributor")
    if any(term in text for term in MANUFACTURER_HINTS):
        tags.add("manufacturer-hint")
    if any(term in text for term in INFO_TERMS):
        tags.add("model-info")
    return sorted(tags)


def extract_results(page, part: str, limit: int) -> list[dict[str, object]]:
    items = page.evaluate(
        """
        () => {
          const out = [];
          const seen = new Set();
          const blocks = Array.from(document.querySelectorAll('li.b_algo, .b_algo, article, .result, .result__body'));
          for (const block of blocks) {
            const a = block.querySelector('h2 a, a.result__a, a[href]');
            if (!a || !a.href || seen.has(a.href)) continue;
            seen.add(a.href);
            const title = (a.innerText || '').trim();
            const sn = block.querySelector('.b_caption p, .result__snippet, p');
            const snippet = (sn ? sn.innerText : block.innerText || '').trim();
            out.push({title, url: a.href, snippet});
          }
          if (out.length < 3) {
            for (const a of Array.from(document.querySelectorAll('a[href]'))) {
              if (!a.href.startsWith('http') || seen.has(a.href)) continue;
              const title = (a.innerText || '').trim();
              if (title.length < 3) continue;
              seen.add(a.href);
              out.push({title, url: a.href, snippet: ''});
            }
          }
          return out.slice(0, 40);
        }
        """
    )
    canon = normalize(part)
    results: list[dict[str, object]] = []
    for item in items:
        title = compact(str(item.get("title", "")))
        url = clean_result_url(str(item.get("url", "")))
        if is_search_ad_url(url):
            continue
        snippet = compact(str(item.get("snippet", "")))[:600]
        haystack = normalize(f"{title} {url} {snippet}")
        mentions_part = bool(canon and canon in haystack)
        if canon and not mentions_part:
            continue
        results.append(
            {
                "title": title,
                "url": url,
                "snippet": snippet,
                "mentions_part": mentions_part,
                "tags": classify(url, title, snippet),
            }
        )
        if len(results) >= limit:
            break
    return results


def default_queries(part: str, brand: str) -> list[str]:
    if brand:
        return [
            f'"{brand}" "{part}"',
            f'"{brand}" "{part}" datasheet',
            f'"{brand}" "{part}" ordering',
            f'"{brand}" "{part}" package',
            f'"{brand}" "{part}" lifecycle',
        ]
    return [
        f'"{part}" datasheet',
        f'"{part}" manufacturer',
        f'"{part}" product page',
        f'"{part}" ordering',
        f'"{part}" package',
    ]


def search(query: str, *, engine: str, part: str, limit: int, timeout: int, proxy: str | None) -> dict[str, object]:
    if engine == "bing":
        url = f"https://www.bing.com/search?q={quote_plus(query)}"
    elif engine == "duckduckgo":
        url = f"https://duckduckgo.com/html/?q={quote_plus(query)}"
    else:
        raise SystemExit(f"unknown engine: {engine}")

    browser = launch_browser(headless=True, proxy=proxy)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    try:
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
        time.sleep(3)
        preview = ""
        try:
            preview = compact(page.inner_text("body"))[:1200]
        except Exception:
            pass
        return {
            "query": query,
            "engine": engine,
            "status": "ok",
            "url": page.url,
            "title": page.title(),
            "results": extract_results(page, part, limit),
            "preview": preview,
        }
    finally:
        context.close()
        browser.close()


def classify_error(exc: BaseException) -> dict[str, str]:
    text = str(exc)
    lower = text.lower()
    if "erofs" in lower or "read-only file system" in lower:
        return {
            "status": "environment_error",
            "reason": "read_only_tmp",
            "error": "Playwright needs a writable temporary directory.",
            "detail": text[-1200:],
        }
    if "no module named" in lower:
        return {
            "status": "environment_error",
            "reason": "playwright_missing",
            "error": "Playwright is not installed.",
            "detail": text[-1200:],
        }
    return {
        "status": "error",
        "reason": "browser_or_navigation_error",
        "error": text[:300],
        "detail": text[-1200:],
    }


def check_environment() -> dict[str, object]:
    temp_dir = tempfile.gettempdir()
    payload: dict[str, object] = {
        "temp_dir": temp_dir,
        "temp_writable": False,
        "playwright": True,
    }
    try:
        with tempfile.TemporaryDirectory(prefix="procurement-agent-check-"):
            payload["temp_writable"] = True
            payload["probe_created"] = True
    except Exception as exc:
        payload.update(classify_error(exc))
        payload["error"] = f"temporary directory is not writable: {exc}"
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--part", help="Part number or model string")
    parser.add_argument("--brand", default="", help="Known brand/manufacturer")
    parser.add_argument("--query", action="append", help="Search query. Repeat to run multiple queries.")
    parser.add_argument("--engine", choices=["bing", "duckduckgo"], default="duckduckgo")
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=35)
    parser.add_argument("--output", help="Write JSON result to this path")
    parser.add_argument("--proxy")
    parser.add_argument("--check-env", action="store_true", help="Check local browser temp prerequisites and exit")
    args = parser.parse_args()

    args.proxy = args.proxy or os.environ.get("BROWSER_PROXY") or None

    if args.check_env:
        print(json.dumps({"environment": check_environment()}, indent=2, ensure_ascii=False))
        return

    part = (args.part or "").strip()
    if not part:
        raise SystemExit("--part cannot be empty")
    brand = args.brand.strip()
    queries = args.query or default_queries(part, brand)
    searches = []
    for query in queries:
        try:
            searches.append(
                search(
                    query,
                    engine=args.engine,
                    part=part,
                    limit=args.limit,
                    timeout=args.timeout,
                    proxy=args.proxy,
                )
            )
        except Exception as exc:
            error = classify_error(exc)
            error.update({"query": query, "engine": args.engine, "results": []})
            searches.append(error)
    payload = {
        "part": part,
        "brand": brand,
        "engine": args.engine,
        "searches": searches,
    }
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()
