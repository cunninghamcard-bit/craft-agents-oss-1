#!/usr/bin/env python3
"""Evidence tools for procurement platform pages.

These helpers deliberately avoid procurement decisions. They only return what a
platform page visibly shows: text contexts, links, prices, stock, and hints.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

from playwright.sync_api import sync_playwright

_pw = sync_playwright().start()


def launch_browser(*, headless: bool = True, proxy: str | None = None) -> Any:
    kwargs: dict[str, Any] = {"headless": headless}
    if proxy:
        kwargs["proxy"] = {"server": proxy}
    return _pw.chromium.launch(**kwargs)


@dataclass(frozen=True)
class Platform:
    key: str
    name: str
    url: str
    selector: str = ""
    button: str = ""
    wait: int = 6


PLATFORMS: dict[str, Platform] = {
    "mouser": Platform("mouser", "Mouser", "https://www.mouser.com/c/?q={part}", wait=7),
    "digikey": Platform("digikey", "DigiKey", "https://www.digikey.com/en/products/result?keywords={part}", wait=8),
    "newark": Platform("newark", "Newark/Corestaff", "https://www.newark.com/", "#search-bar__search__input", wait=6),
    "arrow": Platform("arrow", "Arrow", "https://www.arrow.com/en/products/search?q={part}", wait=8),
    "avnet": Platform("avnet", "Avnet", "https://www.avnet.com/shop/us/search/{part}", wait=8),
    "tme": Platform("tme", "TME", "https://www.tme.eu/en/katalog/?search={part}", wait=8),
    "rs_jp": Platform("rs_jp", "RS-日本", "https://jp.rs-online.com/web/c/?searchTerm={part}", wait=8),
    "xon": Platform("xon", "X-ON Electronics", "https://www.xonelec.com/search?q={part}", wait=8),
    "lcsc": Platform("lcsc", "立创", "https://www.szlcsc.com/", "#global-seach-input", wait=6),
    "yunhan": Platform("yunhan", "云汉", "https://search.ickey.cn/site/index.html?keyword={part}", wait=8),
    "hqew": Platform("hqew", "华强电子", "https://s.hqew.com/{part}.html", wait=5),
}


POPUP_JS = """
() => {
  const selectors = [
    '.onetrust-close-btn-handler',
    '#onetrust-accept-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '.close',
    '.modal-close',
    '[data-dismiss="modal"]',
    '.popup-close',
    '.el-dialog__close',
    '.el-dialog__headerbtn',
    'button[aria-label="Close"]'
  ];
  for (const selector of selectors) {
    try {
      for (const node of document.querySelectorAll(selector)) {
        if (node.offsetParent !== null) node.click();
      }
    } catch (_) {}
  }
  const labels = ['Accept', '同意', '接受', '否'];
  for (const button of document.querySelectorAll('button')) {
    const text = (button.innerText || '').trim();
    if (button.offsetParent !== null && labels.some((label) => text.includes(label))) {
      try { button.click(); } catch (_) {}
    }
  }
}
"""

DOC_TERMS = ("datasheet", "data sheet", "数据手册", "rohs", "reach", "drawing", "specification", "pdf")
ALT_TERMS = (
    "alternative",
    "alternate",
    "substitute",
    "replacement",
    "equivalent",
    "cross reference",
    "similar",
    "compatible",
    "替代",
    "代替",
    "相似",
    "兼容",
    "交叉",
)
ALT_EXCLUDE_PHRASES = (
    "alternative packaging",
    "alternate packaging",
    "packaging alternative",
    "alternative pack",
    "alternate pack",
)
BLOCK_TERMS = ("access denied", "captcha", "human verification", "challenge validation", "请稍候")
LOGIN_REQUIRED_TERMS = (
    "login required",
    "sign in required",
    "please login",
    "please sign in",
    "log in to view",
    "sign in to view",
    "会员登录",
    "请登录",
)


def normalize_part(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", value).lower()


def body_text(page: Any) -> str:
    try:
        return page.inner_text("body") or ""
    except Exception:
        return ""


def dismiss_popups(page: Any, rounds: int = 2) -> None:
    for _ in range(rounds):
        try:
            page.evaluate(POPUP_JS)
        except Exception:
            pass
        time.sleep(0.5)


def wait_ready(page: Any, timeout: int) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        text = body_text(page).strip()
        lower = text.lower()
        if any(term in lower for term in BLOCK_TERMS):
            time.sleep(2)
            continue
        if len(text) > 80:
            return True
        time.sleep(1)
    return False


def goto_page(page: Any, url: str, timeout: int) -> str:
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
        return ""
    except Exception as exc:
        if page.url != "about:blank" or body_text(page).strip():
            return str(exc)[:300]
        raise


def submit_search(page: Any, selector: str, part: str, button: str = "") -> bool:
    try:
        box = page.locator(selector).first
        if box.count() == 0:
            return False
        box.click(timeout=3000)
        box.fill(part)
        if button:
            submit = page.locator(button).first
            if submit.count() > 0:
                submit.click(timeout=3000)
                return True
        page.keyboard.press("Enter")
        return True
    except Exception:
        return False


def compact_text(value: str) -> str:
    return " ".join(value.split())


def contexts_for_terms(text: str, terms: list[str] | tuple[str, ...], limit: int = 8) -> list[str]:
    words = compact_text(text).split(" ")
    joined = " ".join(words)
    contexts: list[str] = []
    seen: set[str] = set()
    lowered_terms = [term.lower() for term in terms if term]
    for index, word in enumerate(words):
        lower_word = word.lower()
        if not any(term in lower_word for term in lowered_terms):
            continue
        ctx = " ".join(words[max(0, index - 12) : index + 22])
        key = normalize_part(ctx[:140])
        if key not in seen:
            seen.add(key)
            contexts.append(ctx)
        if len(contexts) >= limit:
            return contexts
    if not contexts:
        lower_joined = joined.lower()
        for term in lowered_terms:
            pos = lower_joined.find(term)
            if pos >= 0:
                contexts.append(joined[max(0, pos - 160) : pos + 320])
                break
    return contexts[:limit]


def contains_alternative_signal(text: str) -> bool:
    scrubbed = text.lower()
    for phrase in ALT_EXCLUDE_PHRASES:
        scrubbed = scrubbed.replace(phrase, "")
    return any(term in scrubbed for term in ALT_TERMS)


def contexts_for_alternatives(text: str, limit: int = 8) -> list[str]:
    contexts = contexts_for_terms(text, ALT_TERMS, limit=limit * 2)
    return [ctx for ctx in contexts if contains_alternative_signal(ctx)][:limit]


def contexts_for_part(text: str, part: str, limit: int = 8) -> list[str]:
    canon = normalize_part(part)
    words = compact_text(text).split(" ")
    contexts: list[str] = []
    seen: set[str] = set()
    for index, word in enumerate(words):
        clean = normalize_part(word)
        if len(clean) < 4:
            continue
        if canon not in clean and clean not in canon:
            continue
        ctx = " ".join(words[max(0, index - 10) : index + 18])
        key = normalize_part(ctx[:140])
        if key not in seen:
            seen.add(key)
            contexts.append(ctx)
        if len(contexts) >= limit:
            break
    return contexts


def extract_prices(text: str) -> list[str]:
    prices = set(re.findall(r"[\$¥￥€]\s*\d+(?:\.\d+)?", text))
    prices.update(f"¥{price}" for price in re.findall(r"(\d+(?:\.\d+)?)\s*元", text))
    return sorted(prices)[:12]


def extract_stock(text: str) -> list[str]:
    patterns = [
        r"(\d[\d,]*)\s*(?:In Stock|in stock|库存|现货|有货|在庫|pcs|件|個)",
        r"(?:In Stock|in stock|库存|现货|有货|在庫)\s*(\d[\d,]*)",
    ]
    stock: set[str] = set()
    for pattern in patterns:
        stock.update(re.findall(pattern, text, re.IGNORECASE))
    return sorted(stock)[:10]


def extract_links(page: Any) -> list[dict[str, str]]:
    try:
        links = page.evaluate(
            """
            () => Array.from(document.querySelectorAll('a[href]')).slice(0, 300).map(a => ({
              text: (a.innerText || a.getAttribute('aria-label') || '').trim(),
              href: a.href
            })).filter(x => x.href)
            """
        )
    except Exception:
        return []
    compact: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in links:
        href = str(item.get("href", ""))
        text = compact_text(str(item.get("text", "")))[:160]
        key = href + "|" + text
        if href and key not in seen:
            seen.add(key)
            compact.append({"text": text, "href": href})
    return compact[:120]


def link_hints(
    links: list[dict[str, str]],
    terms: tuple[str, ...],
    limit: int = 12,
    *,
    exclude_phrases: tuple[str, ...] = (),
) -> list[dict[str, str]]:
    hints = []
    for link in links:
        haystack = f"{link.get('text', '')} {link.get('href', '')}".lower()
        if exclude_phrases and any(phrase in haystack for phrase in exclude_phrases):
            continue
        if any(term in haystack for term in terms):
            hints.append(link)
        if len(hints) >= limit:
            break
    return hints


def collect_page_evidence(page: Any, platform: Platform, part: str, timeout: int) -> dict[str, Any]:
    result: dict[str, Any] = {
        "collector": platform.key,
        "platform": platform.name,
        "query_part": part,
        "ok": False,
    }
    try:
        url = platform.url.format(part=quote(part, safe=""))
        navigation_warning = goto_page(page, url, timeout)
        time.sleep(1)
        dismiss_popups(page)

        if platform.selector:
            if not submit_search(page, platform.selector, part, platform.button):
                result["error"] = f"search selector not found: {platform.selector}"
                return result
            time.sleep(platform.wait)
        else:
            time.sleep(platform.wait)

        dismiss_popups(page)
        wait_ready(page, timeout)

        title = page.title()
        text = compact_text(body_text(page))
        links = extract_links(page)
        evidence_text = " ".join([page.url, title, text])
        lower_text = evidence_text.lower()

        result.update(
            {
                "ok": True,
                "url": page.url,
                "title": title,
                "navigation_warning": navigation_warning,
                "signals": {
                    "mentions_query_part": bool(contexts_for_part(evidence_text, part, limit=1)),
                    "looks_blocked": any(term in lower_text for term in BLOCK_TERMS),
                    "looks_login_required": any(term in lower_text for term in LOGIN_REQUIRED_TERMS)
                    or any(term in page.url.lower() for term in ("login", "signin", "auth", "member")),
                    "has_datasheet_word": "datasheet" in lower_text or "数据手册" in evidence_text,
                    "has_rohs_word": "rohs" in lower_text,
                    "has_alternative_words": contains_alternative_signal(evidence_text),
                },
                "part_contexts": contexts_for_part(evidence_text, part),
                "price_contexts": contexts_for_terms(evidence_text, ("price", "pricing", "$", "¥", "￥", "€", "价格")),
                "stock_contexts": contexts_for_terms(evidence_text, ("stock", "库存", "现货", "有货", "在庫")),
                "alternative_contexts": contexts_for_alternatives(evidence_text),
                "document_links": link_hints(links, DOC_TERMS),
                "alternative_links": link_hints(links, ALT_TERMS, exclude_phrases=ALT_EXCLUDE_PHRASES),
                "prices": extract_prices(evidence_text),
                "stock": extract_stock(evidence_text),
                "preview": text[:1400],
            }
        )
    except Exception as exc:
        result["error"] = str(exc)[:300]
    return result


def collect_platform(
    key: str,
    part: str,
    *,
    headless: bool = True,
    proxy: str | None = None,
    timeout: int = 35,
) -> dict[str, Any]:
    platform = PLATFORMS[key]
    browser = launch_browser(headless=headless, proxy=proxy)
    context = browser.new_context(viewport={"width": 1600, "height": 1000})
    try:
        page = context.new_page()
        return collect_page_evidence(page, platform, part, timeout)
    finally:
        context.close()
        browser.close()


def classify_error_text(text: str) -> dict[str, str]:
    lower = text.lower()
    if "erofs" in lower or "read-only file system" in lower:
        return {
            "status": "environment_error",
            "reason": "read_only_tmp",
            "error": "Playwright needs a writable temporary directory.",
        }
    if "no module named" in lower:
        return {
            "status": "environment_error",
            "reason": "playwright_missing",
            "error": "Playwright is not installed.",
        }
    return {
        "status": "script_error",
        "reason": "collector_failed",
        "error": compact_text(text)[-300:],
    }


def split_error_text(text: str, limit: int = 1200) -> dict[str, str]:
    if len(text) <= limit:
        return {"stderr": text}
    half = limit // 2
    return {"stderr_head": text[:half], "stderr_tail": text[-half:]}


def check_environment() -> dict[str, object]:
    temp_dir = tempfile.gettempdir()
    payload: dict[str, object] = {
        "temp_dir": temp_dir,
        "temp_writable": False,
    }
    try:
        with tempfile.TemporaryDirectory(prefix="procurement-agent-check-"):
            payload["temp_writable"] = True
            payload["probe_created"] = True
    except Exception as exc:
        payload.update(classify_error_text(str(exc)))
        payload["error"] = f"temporary directory is not writable: {exc}"
    return payload


def write_payload(payload: dict[str, Any], output: str | None) -> None:
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if output:
        Path(output).write_text(text + "\n", encoding="utf-8")
        print(f"wrote {output}", file=sys.stderr)
    else:
        print(text)


def run_platform_cli(key: str) -> None:
    parser = argparse.ArgumentParser(description=f"Collect visible evidence from {PLATFORMS[key].name}")
    parser.add_argument("--part", help="Part number or model string to search")
    parser.add_argument("--output", help="Write JSON result to this path")
    parser.add_argument("--headless", dest="headless", action="store_true", default=True)
    parser.add_argument("--no-headless", dest="headless", action="store_false")
    parser.add_argument("--proxy", help="Proxy URL, such as socks5://user:pass@host:1080")
    parser.add_argument("--timeout", type=int, default=35, help="Navigation/readiness timeout in seconds")
    parser.add_argument("--check-env", action="store_true", help="Check local browser temp prerequisites and exit")
    args = parser.parse_args()

    if args.check_env:
        write_payload({"environment": check_environment()}, args.output)
        return

    part = (args.part or "").strip()
    if not part:
        raise SystemExit("--part cannot be empty")

    print(f"collecting {PLATFORMS[key].name}: {part}", file=sys.stderr)
    result = collect_platform(
        key,
        part,
        headless=args.headless,
        proxy=args.proxy,
        timeout=args.timeout,
    )
    write_payload({"part": part, "collector": key, "platform": asdict(PLATFORMS[key]), "result": result}, args.output)
