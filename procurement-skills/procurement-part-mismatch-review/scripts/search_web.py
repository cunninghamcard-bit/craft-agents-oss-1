#!/usr/bin/env python3
"""Search public web pages and return evidence candidates.

This script does not decide whether parts are equivalent. It only finds likely
public evidence sources: official product pages, ordering guides, PDFs,
cross-reference pages, and distributor exact-MPN pages.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
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


OFFICIAL_HINTS = (
    "official",
    "manufacturer",
    "datasheet",
    "data sheet",
    "drawing",
    "ordering",
    "part numbering",
    "cross reference",
    "qpl",
    "qml",
    "qualified",
    "specification",
    "pdf",
    "产品页",
    "数据手册",
    "订货",
    "图纸",
    "规格书",
    "替代",
    "交叉",
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


def classify_url(url: str, title: str, snippet: str) -> list[str]:
    haystack = f"{url} {title} {snippet}".lower()
    tags: list[str] = []
    if ".pdf" in haystack or "pdf" in haystack:
        tags.append("pdf")
    if any(term in haystack for term in ("datasheet", "data sheet", "数据手册")):
        tags.append("datasheet")
    if any(term in haystack for term in ("ordering", "part numbering", "订货")):
        tags.append("ordering")
    if any(term in haystack for term in ("cross reference", "replacement", "alternative", "兼容", "替代", "交叉")):
        tags.append("cross-reference")
    if any(term in haystack for term in ("qpl", "qml", "qualified products", "合格")):
        tags.append("qualified-list")
    if re.search(r"\b(mouser|digikey|newark|arrow|avnet|rs-online|tme)\b", haystack):
        tags.append("distributor")
    if any(term in haystack for term in OFFICIAL_HINTS):
        tags.append("evidence-candidate")
    return sorted(set(tags))


def extract_results(page, requested: str, offered: str, limit: int) -> list[dict[str, object]]:
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
          return out.slice(0, 30);
        }
        """
    )
    results = []
    for item in items:
        title = compact(str(item.get("title", "")))
        url = clean_result_url(str(item.get("url", "")))
        snippet = compact(str(item.get("snippet", "")))[:500]
        haystack = f"{title} {url} {snippet}".lower()
        mentions_requested = bool(requested and requested.lower() in haystack)
        mentions_offered = bool(offered and offered.lower() in haystack)
        if (requested or offered) and not (mentions_requested or mentions_offered):
            continue
        results.append(
            {
                "title": title,
                "url": url,
                "snippet": snippet,
                "mentions_requested": mentions_requested,
                "mentions_offered": mentions_offered,
                "tags": classify_url(url, title, snippet),
            }
        )
        if len(results) >= limit:
            break
    return results


def search(query: str, *, engine: str, requested: str, offered: str, limit: int, timeout: int, proxy: str | None) -> dict[str, object]:
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
        title = page.title()
        text = ""
        try:
            text = compact(page.inner_text("body"))[:1200]
        except Exception:
            pass
        return {
            "query": query,
            "engine": engine,
            "url": page.url,
            "title": title,
            "results": extract_results(page, requested, offered, limit),
            "preview": text,
        }
    finally:
        context.close()
        browser.close()


def default_queries(requested: str, offered: str) -> list[str]:
    queries = [
        f'"{offered}" "{requested}"',
        f'"{offered}" datasheet',
        f'"{requested}" "{offered}" cross reference',
        f'"{requested}" "{offered}" ordering',
    ]
    return [q for q in queries if q.strip().replace('"', "")]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", action="append", help="Search query. Repeat to run multiple queries.")
    parser.add_argument("--requested", default="", help="Requested/customer part number, used for auto queries and hit markers")
    parser.add_argument("--offered", default="", help="Offered/supplier part number, used for auto queries and hit markers")
    parser.add_argument("--engine", choices=["bing", "duckduckgo"], default="duckduckgo")
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=35)
    parser.add_argument("--output", help="Write JSON result to this path")
    parser.add_argument("--proxy")
    args = parser.parse_args()

    args.proxy = args.proxy or os.environ.get("BROWSER_PROXY") or None

    queries = args.query or default_queries(args.requested.strip(), args.offered.strip())
    if not queries:
        raise SystemExit("provide --query, or both --requested and --offered")

    payload = {
        "requested": args.requested.strip(),
        "offered": args.offered.strip(),
        "engine": args.engine,
        "searches": [
            search(
                query,
                engine=args.engine,
                requested=args.requested.strip(),
                offered=args.offered.strip(),
                limit=args.limit,
                timeout=args.timeout,
                proxy=args.proxy,
            )
            for query in queries
        ],
    }
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.output}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
