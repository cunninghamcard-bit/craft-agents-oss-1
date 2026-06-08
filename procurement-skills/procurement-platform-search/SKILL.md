---
name: procurement-platform-search
description: 在采购平台和授权分销商（立创、Digikey、Mouser 等）上查型号的实时报价、可购库存、产品页、datasheet 和可替代料提示。当用户问“多少钱/哪里能买/有没有现货/帮我找报价/找替代料”，需要外部市场价格与货源线索时使用。查的是外部平台；内部库存用 procurement-local-inventory-lookup。
metadata:
  short-description: 采购平台报价线索查找
  lang: zh
---

# 采购平台报价线索查找

输入一个型号，在 4 个平台上找采购线索（exact MPN 命中、品牌、库存、价格/MOQ、交期、datasheet/产品页、替代/相似料提示）：① Digikey（得捷）② Mouser（贸泽）③ 云汉（ickey.cn）④ master（masterelectronics.com）。

不做供应商真假、价格优劣、是否下单、是否可替代判断。

## Digikey + Mouser —— API（最快最稳）

并发查两个平台，返回归一化 JSON（platform/mpn/manufacturer/stock/price/datasheet/url）：

    python3 .agents/skills/procurement-platform-search/scripts/api_search.py --part "<型号>"

凭证在服务器环境，脚本自动走代理。只查其一加 `--source digikey` 或 `--source mouser`。

## 云汉 + master —— CloakBrowser 采集（这两站有反爬，必须真浏览器）

master 是 Akamai、云汉有验证码，普通 fetch / 轻量无头浏览器都过不了。用 cloak_search.py（CloakBrowser 真 Chromium）：

    cloakbrowser-python .agents/skills/procurement-platform-search/scripts/cloak_search.py --part "<型号>" 2>/dev/null

只查其一加 `--source master` 或 `--source ickey`。**务必加 `2>/dev/null`**，否则 cloakbrowser 的日志会混进 stdout 破坏 JSON。返回每平台一段商品行文本：
- **master**：抽 `.search-result`，每行 = 型号/厂牌/库存/交期/阶梯价（USD）。走住宅代理。master 目录偏继电器/保护/被动件，未必有 MCU；无结果如实写“该平台无此料”。
- **云汉**：抓搜索页 API 响应，每行 = 型号/厂牌/封装/库存/交期/阶梯价（RMB+USD），多供应商各一行。境内直连，无需登录。
- 启动真 Chromium 较慢（每平台 ~十几秒），脚本已串行+用完即关防 OOM，**别并发多开**。

## 输出

把 4 个平台结果合并给采购（保留可合并字段）：平台、型号是否命中、品牌/品类、库存、价格/MOQ、交期、链接、备注；以及阻碍项（哪些平台没查到/被拦）。

## 边界

- 平台有结果 ≠ 本地可采购。
- 页面写 alternate/similar ≠ 替代成立；型号不同转 `procurement-part-mismatch-review`。
- 价格/库存数字结合上下文（可能混 MOQ、倍数等），不要直接当报价。
