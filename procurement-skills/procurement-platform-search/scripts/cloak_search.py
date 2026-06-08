#!/usr/bin/env python3
"""
无 API 平台采集（master / 云汉 ickey），用 CloakBrowser 真 Chromium 过反爬。

为什么要它：master 是 Akamai Bot Manager（curl 吃 403），云汉是点击验证码——
普通 fetch、轻量无头浏览器（lightpanda/obscura）都过不了；只有 CloakBrowser
（真 Chromium + C++ 级指纹伪装）实测能过并渲染出结果。Digikey/Mouser 有 API，
用 api_search.py，别用这个。

必须用 cloakbrowser 的 venv python 跑（普通 python3 没有 cloakbrowser 模块）：
  cloakbrowser-python .agents/skills/procurement-platform-search/scripts/cloak_search.py --part "LM358"

约束（小内存服务器）：串行启动、用完即关，一次只开一个 Chromium，避免 OOM。

输出：每个平台返回渲染后的搜索结果页可见文本（agent 自己从里面抽型号/库存/价格）。
master 走住宅代理（mihomo 127.0.0.1:7899），云汉境内直连。
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

# 平台配置：搜索 URL 模板 + 是否走代理（海外站走住宅代理，境内直连）
PLATFORMS = {
    "master": {
        "url": "https://www.masterelectronics.com/en/keywordsearch?text={part}",
        "proxy": MIHOMO,
        "wait_until": "networkidle",
    },
    "ickey": {  # 云汉站内搜索（site/index 才是 MPN 搜索；yuncang 是云仓促销页）
        "url": "https://search.ickey.cn/site/index.html?keyword={part}",
        "proxy": None,
        "wait_until": "networkidle",
    },
}


def scrape(part, name, cfg, wait, max_chars):
    url = cfg["url"].format(part=part)
    kw = {"headless": True, "humanize": True}
    if cfg["proxy"]:
        kw["proxy"] = cfg["proxy"]
    b = launch(**kw)
    try:
        p = b.new_page()
        try:
            p.goto(url, wait_until=cfg.get("wait_until", "domcontentloaded"), timeout=wait * 1000)
        except Exception:
            pass  # 渲染超时也尝试取已有内容
        p.wait_for_timeout(2500)
        text = p.inner_text("body")
        return {"platform": name, "url": url, "text": text[:max_chars]}
    finally:
        b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", required=True)
    ap.add_argument("--source", default="master,ickey",
                    help="逗号分隔，默认 master,ickey")
    ap.add_argument("--wait", type=int, default=30, help="单页超时秒")
    ap.add_argument("--max-chars", type=int, default=9000, help="每平台返回文本上限（云汉页较长，可调大）")
    args = ap.parse_args()

    out = {"part": args.part, "results": [], "errors": []}
    # 串行：一次只开一个 Chromium，省内存
    for name in [s.strip() for s in args.source.split(",") if s.strip()]:
        cfg = PLATFORMS.get(name)
        if not cfg:
            out["errors"].append({"platform": name, "error": "未知平台（仅 master/ickey）"})
            continue
        try:
            out["results"].append(scrape(args.part, name, cfg, args.wait, args.max_chars))
        except Exception as e:
            out["errors"].append({"platform": name, "error": str(e)})

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
