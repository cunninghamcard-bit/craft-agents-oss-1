#!/usr/bin/env python3
"""
无 API 平台采集（master / 云汉 ickey），用 CloakBrowser 真 Chromium 过反爬。

master 是 Akamai Bot Manager（curl 403）、云汉是点击验证码——普通 fetch 和轻量无头
浏览器（lightpanda/obscura）都过不了；只有 CloakBrowser（真 Chromium + C++ 级指纹
伪装）实测能过。Digikey/Mouser 有 API，用 api_search.py，别用这个。

必须用 cloakbrowser 的 venv python 跑：
  cloakbrowser-python .agents/skills/procurement-platform-search/scripts/cloak_search.py --part "LM358" --source master

约束（小内存服务器）：串行启动、用完即关，一次只开一个 Chromium，避免 OOM。

输出：master 直接抽商品行（.search-result，干净）；云汉商品搜索端点尚未定位
（site/index 是站内搜索、对 MPN 返回 0 条），暂返回结果区文本、上限收紧，待后续
找到真实商品 API 再结构化。
"""
import argparse
import json
import sys

try:
    from cloakbrowser import launch
except ImportError:
    print(json.dumps({"error": "no cloakbrowser module — 用 cloakbrowser-python 跑本脚本"}, ensure_ascii=False))
    sys.exit(1)

MIHOMO = "http://127.0.0.1:7899"

PLATFORMS = {
    "master": {
        # Akamai；走住宅代理。商品行选择器干净
        "url": "https://www.masterelectronics.com/en/keywordsearch?text={part}",
        "proxy": MIHOMO,
        "selector": ".search-result",
    },
    "ickey": {  # 云汉，境内直连。⚠️ 商品搜索端点待定，当前 URL 是站内搜索
        "url": "https://search.ickey.cn/site/index.html?keyword={part}",
        "proxy": None,
        "selector": None,
    },
}


def scrape(part, name, cfg, wait, max_chars, limit):
    url = cfg["url"].format(part=part)
    kw = {"headless": True, "humanize": True}
    if cfg["proxy"]:
        kw["proxy"] = cfg["proxy"]
    b = launch(**kw)
    try:
        p = b.new_page()
        try:
            p.goto(url, wait_until="networkidle", timeout=wait * 1000)
        except Exception:
            pass
        p.wait_for_timeout(2500)
        sel = cfg.get("selector")
        if sel:
            els = p.query_selector_all(sel)
            rows = []
            for e in els[:limit]:
                try:
                    rows.append(" ".join((e.inner_text() or "").split()))
                except Exception:
                    pass
            text = "\n".join(r for r in rows if r)
            if not text:
                text = f"（{sel} 无命中——该平台可能无此料，或页面结构变了）"
        else:
            text = p.inner_text("body")[:max_chars]
        return {"platform": name, "url": url, "text": text}
    finally:
        b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", required=True)
    ap.add_argument("--source", default="master,ickey", help="逗号分隔，默认 master,ickey")
    ap.add_argument("--wait", type=int, default=30, help="单页超时秒")
    ap.add_argument("--max-chars", type=int, default=4000, help="无选择器平台的文本上限")
    ap.add_argument("--limit", type=int, default=15, help="有选择器平台返回的最多商品行")
    args = ap.parse_args()

    out = {"part": args.part, "results": [], "errors": []}
    for name in [s.strip() for s in args.source.split(",") if s.strip()]:
        cfg = PLATFORMS.get(name)
        if not cfg:
            out["errors"].append({"platform": name, "error": "未知平台（仅 master/ickey）"})
            continue
        try:
            out["results"].append(scrape(args.part, name, cfg, args.wait, args.max_chars, args.limit))
        except Exception as e:
            out["errors"].append({"platform": name, "error": str(e)})

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
