---
name: procurement-platform-search
description: 在采购平台和授权分销商（立创、Digikey、Mouser 等）上查型号的实时报价、可购库存、产品页、datasheet 和可替代料提示。当用户问“多少钱/哪里能买/有没有现货/帮我找报价/找替代料”，需要外部市场价格与货源线索时使用。查的是外部平台；内部库存用 procurement-local-inventory-lookup。
metadata:
  short-description: 采购平台报价线索查找
  lang: zh
---

# 采购平台报价线索查找

输入一个型号，在 4 个平台上同时找采购线索（exact MPN 命中、品牌、库存、价格/MOQ、交期、datasheet/产品页、替代/相似料提示），按可靠度优先：① Digikey（得捷）② Mouser（贸泽）③ 云汉（ickey.cn）④ master（masterelectronics.com）。

不做供应商真假、价格优劣、是否下单、是否可替代判断。

## Digikey + Mouser（有 API，最可靠）

跑脚本，一次并发查两个平台，返回归一化 JSON（platform/mpn/manufacturer/stock/price/datasheet/url）：

    python3 .agents/skills/procurement-platform-search/scripts/api_search.py --part "<型号>"

凭证已配在服务器环境（`DIGIKEY_*` / `MOUSER_API_KEY`），脚本自动走代理。只查其一：`--source digikey` 或 `--source mouser`。

## 云汉 + master（暂无 API）

用你自己的 WebSearch / WebFetch 查这两个站的型号页/报价线索。注意：

- 云汉（ickey.cn）有验证码 + 限频，数据 JS 渲染，常拿不到完整结果。
- master（masterelectronics.com）搜索是 JS 渲染页。

拿不到就如实写“线索不可用/被拦”，不要硬编或猜测库存价格。

## 输出

把 4 个平台的结果合并给采购（保留可合并字段）：平台、型号是否命中、品牌/品类、库存、价格/MOQ、交期、链接、备注；以及阻碍项（哪些平台没查到/被拦）。

## 边界

- 平台有结果 ≠ 本地可采购。
- 页面写 alternate/similar ≠ 替代成立；型号不同转 `procurement-part-mismatch-review`。
- 价格/库存数字结合上下文（可能混 MOQ、倍数等），不要直接当报价。
