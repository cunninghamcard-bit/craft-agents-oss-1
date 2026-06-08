# 搜索资料方法

## 1. 保留原始输入

记录：

- 采购型号原文
- 报价型号原文
- 已知品牌，没有就写未知
- 报价平台或供应商，没有就写未知

不要先改写型号。

## 2. 先看差异在哪里

按原文、分隔符、括号、尾缀去看差异。

常见差异：

- 写法差异：横杠、空格、大小写、小数点、单位、容易混淆的字符。
- 后缀差异：包装、颜色、温度、认证、版本、RoHS、尾缀。
- 主体差异：系列、前缀、数字段、封装、规格主体。
- 标准号和商业料号差异。
- 市场名和订货号差异。
- 明确替代关系。

这一步只写看得见的字符差异，不猜业务含义。

## 3. 生成搜索词

品牌未知时至少查：

```text
"<采购型号>" "<报价型号>"
"<采购型号>"
"<报价型号>"
"<采购型号>" "<报价型号>" cross reference
"<采购型号>" "<报价型号>" replacement
"<采购型号>" "<报价型号>" datasheet
```

品牌已知时至少查：

```text
"<品牌>" "<采购型号>"
"<品牌>" "<报价型号>"
"<品牌>" "<采购型号>" "<报价型号>"
"<品牌>" "<采购型号>" ordering guide
"<品牌>" "<报价型号>" datasheet
"<品牌>" "<采购型号>" "<报价型号>" cross reference
"<品牌>" "<采购型号>" "<报价型号>" replacement
```

按差异补通用词：

- 后缀差异：`ordering information`、`part numbering`、`package`、`suffix`
- 标准号/商业料号：`qualified product list`、`standard`、`manufacturer part number`、`cross reference`
- 主体差异：双方 exact MPN、`series`、`family`、`specification`
- 市场名/订货号：`ordering code`、`orderable part number`、`specification`、`product change notice`
- 替代关系：`replacement`、`replacement notice`、`alternative`、`cross reference`
- 图纸/尺寸：`drawing`、`sales drawing`、`outline`、`dimensions`
- 写法差异：双方 exact MPN、`alternate part number`、`alias`、`part detail`
- 字符混淆：双方 exact MPN、`part numbering`、`ordering code`、`nameplate`、`label`、`photo`

## 4. 优先打开这些页面

1. 原厂产品页。
2. 原厂 datasheet、ordering guide、part numbering、图纸。
3. 原厂 cross-reference、replacement、product change notice。
4. 授权分销商 exact MPN 页面。
5. 普通平台和第三方资料只作为线索。

不要只看搜索结果标题。必须打开页面，看页面实际能证明什么。

如果页面被拦、登录墙、403、JS 限制、搜索脚本失败，不要卡住。记录它本来想证明什么，然后换搜索入口。

## 5. 记录查到和没查到

每个打开页面只提取它能说明什么：

- 说明两个型号的差异字段、后缀、字符、订货码或规格含义。
- 说明某个型号的关键规格。
- 说明两个型号有对应、替代、同订货项或 cross-reference 关系。
- 说明两个型号关键属性冲突。
- 什么都不能证明。

还要记录没查到什么：

- 没找到差异字段、后缀、字符或订货码含义说明。
- 没找到两个型号同列。
- 没找到替代或对应关系。
- 没找到订货说明或后缀解释。

这些缺口会决定最后要让供应商补什么材料。
