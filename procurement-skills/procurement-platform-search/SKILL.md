---
name: procurement-platform-search
description: 在采购平台和授权分销商（立创、Digikey、Mouser 等）上查型号的实时报价、可购库存、产品页、datasheet 和可替代料提示。当用户问“多少钱/哪里能买/有没有现货/帮我找报价/找替代料”，需要外部市场价格与货源线索时使用。查的是外部平台；内部库存用 procurement-local-inventory-lookup。
metadata:
  short-description: 采购平台报价线索查找
  lang: zh
---

# 采购平台报价线索查找

输入一个型号，在 4 个平台查采购线索：① Digikey（得捷）② Mouser（贸泽）③ 云汉（ickey.cn）④ master（masterelectronics.com）。

**直接按下面两步固定方法调，不要自己另想搜索方式、不要研究反爬、不要去摸接口——下面就是已验证能用的路径。**

## 直接这么做

**Digikey + Mouser —— 官方 API（最快最稳）：**

    python3 .agents/skills/procurement-platform-search/scripts/api_search.py --part "<型号>"

凭证已在服务器环境，脚本自动走代理、并发查两家，返回归一化 JSON。

**master + 云汉(ickey) —— CloakBrowser（这两站有反爬，必须真浏览器）：**

    cloakbrowser-python .agents/skills/procurement-platform-search/scripts/cloak_search.py --part "<型号>" 2>/dev/null

返回每平台商品行文本：master = 型号/厂牌/库存/交期/USD阶梯价；云汉 = 型号/厂牌/封装/库存/交期/RMB+USD阶梯价（多供应商各一行）。`2>/dev/null` 必加，否则日志污染 JSON。只查其一加 `--source master` 或 `--source ickey`。

把两步的结果合并给采购。

## 这些已固化在脚本里（你不用重新摸）

- **Digikey/Mouser** 有官方 API，api_search.py 直接调，别用浏览器。
- **master = Akamai Bot Manager**：普通 curl / WebFetch / 轻量无头浏览器一律 403，**别试**；数据是 SSR HTML，只有 CloakBrowser 真 Chromium 能过，走住宅代理（脚本内置）。
- **云汉（ickey.cn，即 ICKey/云汉芯城）= 点击验证码**：普通 fetch 撞验证码、拿不到；数据走 AJAX 接口 `ajax-get-res-v002`，CloakBrowser 过验证码后抓接口响应（无需登录、境内直连，脚本内置）。

→ **你只管调这两个脚本、读返回结果，不要再去找搜索 URL、试参数、测 curl、研究怎么绕反爬。**

## 输出

合并 4 平台给采购（保留可合并字段）：平台、型号是否命中、品牌/品类、库存、价格/MOQ、交期、链接、备注；以及阻碍项（哪些平台没查到/被拦）。

## 边界

- 平台有结果 ≠ 本地可采购。
- 页面写 alternate/similar ≠ 替代成立；型号不同转 `procurement-part-mismatch-review`。
- 价格/库存数字结合上下文（可能混 MOQ、倍数等），不要直接当报价。
- master 目录偏继电器/保护/被动件，未必有 MCU；无结果如实写“该平台无此料”。
- CloakBrowser 较慢（每平台十几秒），脚本已串行+用完即关防 OOM，**别并发多开**。
