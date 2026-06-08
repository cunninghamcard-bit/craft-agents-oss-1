---
name: procurement-platform-search
description: 在采购平台和授权分销商（立创、Digikey、Mouser 等）上查型号的实时报价、可购库存、产品页、datasheet 和可替代料提示。当用户问“多少钱/哪里能买/有没有现货/帮我找报价/找替代料”，需要外部市场价格与货源线索时使用。查的是外部平台；内部库存用 procurement-local-inventory-lookup。
metadata:
  short-description: 采购平台报价线索查找
  lang: zh
---

# 采购平台报价线索查找

输入一个型号，在采购平台和授权分销商（立创、Digikey、Mouser、Newark 等）上找采购线索：exact MPN 页面、品牌、库存、价格/MOQ/SPQ、交期、datasheet/产品页、替代或相似料提示、页面是否被拦/需登录/无结果。

用你自己的联网工具（WebSearch / WebFetch，必要时 searxng）。

不做供应商真假、价格优劣、是否下单、是否可替代判断。

## 输出

平台线索（保留可合并字段）：平台、型号是否命中、品牌/品类、库存、价格/MOQ、交期、链接、备注；以及阻碍项。

## 边界

- 平台有结果 ≠ 本地可采购。
- 页面写 alternate/similar ≠ 替代成立；型号不同转 `procurement-part-mismatch-review`。`Alternative Packaging` 这类只是包装提示，不是替代料。
- 价格/库存数字要结合上下文（可能混入 MOQ、倍数、电话等），不要直接当报价。
- 页面被拦/登录墙时只说明线索不可用，不硬推断库存或价格。
