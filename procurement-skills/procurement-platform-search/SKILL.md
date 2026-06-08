---
name: procurement-platform-search
description: 在采购平台和授权分销商（立创、Digikey、Mouser 等）上查型号的实时报价、可购库存、产品页、datasheet 和可替代料提示。当用户问“多少钱/哪里能买/有没有现货/帮我找报价/找替代料”，需要外部市场价格与货源线索时使用。查的是外部平台；内部库存用 procurement-local-inventory-lookup。
metadata:
  short-description: 采购平台报价线索查找
  lang: zh
---

# 采购平台报价线索查找

**默认四家平台全部一起搜，合并结果给采购**：① Digikey（得捷）② Mouser（贸泽）③ 云汉（ickey.cn）④ master（masterelectronics.com）。

不做供应商真假、价格优劣、是否下单、是否可替代判断。

## 默认就这么做（四家都查，两个脚本都跑，可并发）

**Digikey + Mouser —— 官方 API：**

    python3 .agents/skills/procurement-platform-search/scripts/api_search.py --part "<型号>"

**云汉(ickey) + master + octopart —— CloakBrowser（有反爬/需真浏览器）：**

    cloakbrowser-python .agents/skills/procurement-platform-search/scripts/cloak_search.py --part "<型号>" 2>/dev/null

默认就跑 master + 云汉 + **octopart**（octopart 聚合 Avnet/Newark/Arrow/DigiKey/Mouser/LCSC 等多分销商库存报价，货源比 Digikey/Mouser API 广）。三个串行、每个十几秒，较慢但货源全；只要其中某个加 `--source master` / `ickey` / `octopart`。

两个脚本都要跑（独立，可并发起两个 Bash），把结果**合并**给采购。`2>/dev/null` 必加，否则日志污染 JSON。

## 四家之外（仅当用户还想要更多货源时，用 CloakBrowser）

四家查完合并给用户后，如果用户还要别的渠道（如立创/LCSC、其它分销商或代理），**也用 CloakBrowser 补，别用普通 WebFetch**（这些站多半也有反爬）：先用 WebSearch 找到该分销商的搜索/产品页 URL，再用 cloak_fetch.py 渲染取文本——

    cloakbrowser-python .agents/skills/procurement-platform-search/scripts/cloak_fetch.py "<分销商搜索页URL>" 2>/dev/null

海外站加 `--proxy`（走住宅代理），境内站（立创等）不加；找到商品行选择器可加 `--selector ".xxx"` 让输出更干净。**不要默认就查这些**，只在用户明确还要更多货源时才补。

## 这些已固化在脚本里（你不用重新摸）

- **Digikey/Mouser** 有官方 API，api_search.py 直接调，别用浏览器。
- **master = Akamai Bot Manager**：普通 curl / WebFetch / 轻量无头浏览器一律 403，**别试**；数据是 SSR HTML，只有 CloakBrowser 真 Chromium 能过，走住宅代理（脚本内置）。
- **云汉（ickey.cn，即 ICKey/云汉芯城）= 点击验证码**：数据走 AJAX 接口 `ajax-get-res-v002`，CloakBrowser 过验证码后抓接口响应（无需登录、境内直连，脚本内置）。

→ **你只管调这两个脚本、读结果，不要再去找搜索 URL、试参数、测 curl、研究怎么绕反爬。**

## 输出

把四家结果合并给采购（保留可合并字段）：平台、型号是否命中、品牌/品类、库存、价格/MOQ、交期、链接、备注；以及阻碍项（哪些平台没查到/被拦）。

## 边界

- 平台有结果 ≠ 本地可采购。
- 页面写 alternate/similar ≠ 替代成立；型号不同转 `procurement-part-mismatch-review`。
- 价格/库存数字结合上下文（可能混 MOQ、倍数等），不要直接当报价。
- master 目录偏继电器/保护/被动件，未必有 MCU；无结果如实写“该平台无此料”。
- CloakBrowser 较慢（每平台十几秒），脚本已串行+用完即关防 OOM，**别在 cloak_search 内并发多开**。
