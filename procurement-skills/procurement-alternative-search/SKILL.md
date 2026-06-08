---
name: procurement-alternative-search
description: 给一个电子元器件型号（停产/缺货/想找替代），查找候选替代料并判断能不能真替。当用户问“X 有没有替代料/找个能替 X 的/X 停产了用什么/pin to pin 替代/有没有兼容料”时使用。本 skill 负责“找候选 + 判断”；只判断已知一对型号用 procurement-part-mismatch-review。
metadata:
  short-description: 查找替代料
  lang: zh
---

# 查找替代料

给一个型号，先找候选替代料，再逐个判断能不能真替，给采购一份可用的替代清单。

## 第一步：找候选（四个源，能并发就并）

1. **云汉原生替代料接口（最直接，带规格摘要）**：

       cloakbrowser-python .agents/skills/procurement-platform-search/scripts/cloak_search.py --part "<型号>" --source ickey-replace 2>/dev/null

   返回每个替代料：`型号 | 规格摘要 | 品类 | 库存 | 交期 | 阶梯价 | datasheet`。规格摘要（如“10uF ±10% 25V X5R”）正好拿来跟原型号对比。

2. **平台 similar/alternate 提示**：先 `api_search.py --part "<型号>"` 拿原型号的厂牌/品类/封装/datasheet；再看 Digikey/Mouser/master 结果里的“替代/相似料提示”（platform-search 的 `--source master` 等会带）。

3. **网查 cross-reference**：WebSearch `"<型号>" cross reference / replacement / equivalent / 替代型号`，找原厂或第三方替换表、停产替代通知（PCN）。

4. **同品类同规格换品牌**：用第 1/2 步拿到的规格（封装+核心参数），在平台搜其它品牌的同规格料作候选。

把候选去重，每个记：替代型号、品牌、规格、来源、库存/价（有就带）。

## 第二步：判断每个候选能不能真替

对每个候选，按 `procurement-part-mismatch-review` 的规则判断（采购型号=原型号，报价型号=候选）：能用 / 不能用 / 需补料。**别只凭规格摘要相近就说能替**——封装、电压、精度、温度、认证、pin 兼容性任一冲突就不能替。

## 输出

替代清单，按可用度排：

- 替代型号 | 品牌 | 规格 | 来源 | 库存/价 | **判断结论（能替/不能替/需补料）| 理由**
- 没找到能替的就如实说，并列出查过哪些源、缺什么资料。

## 边界

- 规格摘要相近 ≠ 能替；结论以差异判断为准。
- 最终可用性要采购/工程确认（pin compatible、认证、客户是否接受）。
- 找候选用本 skill；只判断已知一对用 `procurement-part-mismatch-review`；查报价货源用 `procurement-platform-search`。
