---
name: procurement-model-info-search
description: 采购流程第一步：拿到陌生电子元器件型号（MPN）时，搜公开资料识别它——品牌/厂商、品类、规格、封装、生命周期（在产/停产/EOL）。当用户给出一个或多个不认识的型号，或问“这是什么型号/哪个品牌/什么封装”，且后续要查库存、平台报价或供应商但型号信息还不全时使用。只负责识别；查报价用 procurement-platform-search，查库存用 procurement-local-inventory-lookup。
metadata:
  short-description: 采购型号信息搜索
  lang: zh
---

# 采购型号信息搜索

## Quick start

```bash
python3 .agents/skills/procurement-model-info-search/scripts/search_model_info.py --part "STM32F103C8T6" --limit 8
```

## 只处理这件事

输入一个采购型号或报价型号，查清它公开资料里是什么：

- 可能品牌/制造商
- 品类/物料类型
- 核心规格字段
- 封装、包装、温度、认证、生命周期等采购相关字段
- 官方产品页、datasheet、订货说明、授权渠道 exact MPN 页面
- 可用于后续搜索的标准写法、别名、订货号线索

不要用这个 skill 判断两个型号是否可替代。两个型号不同，转给 `procurement-part-mismatch-review`。

## 输入

- 必填：型号
- 可选：已知品牌、品类、供应商/平台上下文、客户备注

品牌缺失时直接查，不要停止。

## 执行方法

先保留型号原文，不要先归一化。

优先找这些公开资料：

1. 原厂产品页。
2. 原厂 datasheet、ordering guide、part numbering、drawing。
3. 授权分销商 exact MPN 页面。
4. 平台页面只能作为品牌、品类、库存、价格线索，不作为官方规格结论。

需要快速找入口时运行：

```bash
python3 .agents/skills/procurement-model-info-search/scripts/search_model_info.py --part "<型号>" --brand "<品牌>" --engine duckduckgo --limit 8 --output "/tmp/model-info.json"
```

没有品牌时省略 `--brand`。

快速验证时用单条 query，直接输出 stdout，避免默认多轮搜索耗时：

```bash
python3 .agents/skills/procurement-model-info-search/scripts/search_model_info.py --part "<型号>" --query '"<型号>" datasheet' --engine duckduckgo --limit 3 --timeout 12
```

脚本需要 Playwright 能写临时目录。若环境是纯只读沙箱，可能返回 `environment_error/read_only_tmp`；这表示运行环境阻碍，不代表型号没有资料。可先检查：

```bash
python3 .agents/skills/procurement-model-info-search/scripts/search_model_info.py --check-env
```

脚本输出的是搜索入口和页面线索。需要确认品牌、规格、封装、生命周期时，继续打开原厂页面或 datasheet 核对；不要只凭聚合站标题下结论。

## 输出给后续任务

用结构化短结论，不写搜索过程：

```text
型号：...
品牌/制造商：已确认/疑似/未知，...
品类：...
核心规格：...
封装/包装/生命周期：...
可用搜索写法：...
公开资料：
- 来源：...
  链接：...
  说明：...
未确认信息：...
可组合用途：
- 库存查找用型号：...
- 平台搜索用型号：...
- 供应商筛选用品牌/品类：...
置信度：高 / 中 / 低
```

## 边界

- 查到单个型号资料，不等于证明它能替代另一个型号。
- 品牌/品类不清时，输出“疑似/未知”和缺口，不要硬猜。
- 页面打不开、登录、验证、403 要写成资料阻碍。
