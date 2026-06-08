---
name: procurement-platform-search
description: 在采购平台和授权分销商（立创、Digikey、Mouser 等）上查型号的实时报价、可购库存、产品页、datasheet 和可替代料提示。当用户问“多少钱/哪里能买/有没有现货/帮我找报价/找替代料”，需要外部市场价格与货源线索时使用。查的是外部平台；内部库存用 procurement-local-inventory-lookup。
metadata:
  short-description: 采购平台报价线索查找
  lang: zh
---

# 采购平台报价线索查找

## Quick start

```bash
python3 .agents/skills/procurement-platform-search/scripts/run_collectors.py --part "STM32F103C8T6" --collectors mouser,digikey --parallel 2
```

查看可用平台：`--list`。扩大范围：`--collectors all`。

## 只处理这件事

输入一个型号，在平台上找采购线索：

- 平台是否有 exact MPN 页面或搜索结果。
- 页面显示的品牌、库存、价格、MOQ/SPQ、交期线索。
- datasheet、产品页、替代/相似料链接。
- 页面是否被拦截、要求登录、无结果。

不要做供应商真假、价格优劣、是否下单、是否可替代判断。

## 可组合用法

本 skill 不判断是否应该查平台，也不等待其他 skill；只要任务需要平台报价/库存/产品页线索，就可以单独运行。

常见输入来源：

- 型号信息 skill 给出的标准写法、品牌、品类或核心规格线索。
- 库存 skill 给出的“无明确库存”或“命中但需复核”状态。
- 采购人员直接给出的型号、品牌、平台范围。

在“本地无明确库存”场景，本 skill 通常和 `procurement-supplier-shortlist` 并行运行。两者是独立证据源，不互为前置条件；本 skill 输出平台线索，供应商 skill 输出候选名单，后续由当前任务合并对比。

输出时保留可合并字段：平台、链接、exact MPN 命中、品牌/品类、库存、价格/MOQ、交期、datasheet/产品页、替代或相似料提示、阻碍。

## 执行入口

优先用已有平台采集器：

```bash
python3 .agents/skills/procurement-platform-search/scripts/run_collectors.py --part "<型号>" --collectors mouser,digikey,newark --parallel 3 --output "/tmp/platform-search.json"
```

需要扩大范围时：

```bash
python3 .agents/skills/procurement-platform-search/scripts/run_collectors.py --part "<型号>" --collectors all --parallel 3 --output "/tmp/platform-search.json"
```

可用平台列表：

```bash
python3 .agents/skills/procurement-platform-search/scripts/run_collectors.py --list
```

脚本需要 Playwright 能写临时目录。若环境是纯只读沙箱，可能返回 `environment_error/read_only_tmp`；这表示运行环境阻碍，不代表平台无结果。可先检查：

```bash
python3 .agents/skills/procurement-platform-search/scripts/run_collectors.py --check-env
```

快速验证或子任务测试时可以不传 `--output`，直接看 stdout；正式留证据时再写 `/tmp` 或项目允许的临时目录。

## 输出

给采购人员只写可用线索：

```text
平台线索：
- 平台：...
  型号命中：是/否/不确定
  品牌/品类：...
  库存/价格/MOQ：...
  链接：...
  备注：...

阻碍：
- ...
```

## 边界

- 平台有结果，不等于本地可采购。
- 平台写了 alternate/similar，不等于替代成立；型号不同要转给 `procurement-part-mismatch-review`。`Alternative Packaging` 这类包装提示不要当成替代料提示。
- 页面被拦截或登录墙时，只说明线索不可用，不要硬推断库存或价格。
- `prices`、`stock` 是页面文本正则线索，可能混入最小购买量、倍数、电话或其他数字；给采购输出前必须结合 `part_contexts`、`price_contexts`、`stock_contexts` 核对上下文。
