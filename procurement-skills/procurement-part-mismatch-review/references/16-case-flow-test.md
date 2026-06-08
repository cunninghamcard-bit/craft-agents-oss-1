# 16 条真实用例重跑结果

日期：2026-05-22

本文件记录 16 条真实用例按当前规则重跑后的结果。当前规则：

- 业务结论只用 `不影响使用` / `影响使用`。
- 资料不足不作为第三种结论，只写入不足类型：`无` / `差异资料不足` / `关系证据不足` / `使用条件不足`。
- 验收重点不是确认型号真假，而是看差异含义、覆盖/替代依据、客户或工程接受条件、补料动作是否清楚。

| case | 采购型号 | 报价型号 | 结论 | 不足类型 | 差异是什么 | 覆盖/替代依据 | 客户/工程条件 | 需要补什么材料 | 置信度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 43 | `M81969/8-05` | `DAK95-20B(M81969/8-05)` | 不影响使用 | 无 | 标准号和商业料号写法不同。 | DMC 官方页和 NAVAIR QPL 都把 `DAK95-20B` 对应到 `M81969/8-05`，属于同一工具/军标号对应关系。DMC：<https://dmctools.com/dak95-20b>；NAVAIR QPL：<https://www.navair.navy.mil/qpl/sites/g/files/jejdrs526/files/document/%5Bfilename%5D/QPL-81969-15-SIS.pdf> | 无。 | 无；如采购流程要求供应商来源合规，再让供应商补 COC 或授权来源证明。 | 高 |
| 66 | `55P00211-16-9` | `55PC0211-16-9` | 影响使用 | 关系证据不足 | 主体段从 `55P` 变成 `55PC`，不是横杠、空格或大小写差异。 | 能看到 `55PC0211-16-9` 的规格资料，TE：<https://www.te.com.cn/chn-zh/product-277603-000.html>；TE/Raychem 图纸：<https://www.mouser.com/datasheet/2/418/2/NG_CD_55PC0211_H-909867.pdf>。但这些资料不能证明它覆盖 `55P00211-16-9`。 | 无客户/工程接受条件，当前卡在型号覆盖关系。 | 要供应商或 TE 原厂补 `55P00211` 与 `55PC0211` 的同订货项、替代、cross-reference 或书面确认。 | 低 |
| 74 | `55P00211-16-9` | `55PC0211-16-9` | 影响使用 | 关系证据不足 | 主体段从 `55P` 变成 `55PC`。 | 能看到 `55PC0211-16-9` 的 TE/Arrow 规格资料，TE：<https://www.te.com.cn/chn-zh/product-277603-000.html>；Arrow：<https://www.arrow.com/en/products/55pc0211-16-9/te-connectivity>。没有资料证明它和采购型号同料或可替代。 | 无客户/工程接受条件，当前卡在型号覆盖关系。 | 要供应商或 TE 原厂补同订货项、替代证明、订货编码说明或书面确认。 | 低 |
| 80 | `55P00211-16-9` | `55PC0211-16-9` | 影响使用 | 关系证据不足 | 主体段从 `55P` 变成 `55PC`。 | 能看到 `55PC0211-16-9` 的规格资料，TE：<https://www.te.com.cn/chn-zh/product-277603-000.html>；TE/Raychem 图纸：<https://www.mouser.com/datasheet/2/418/2/NG_CD_55PC0211_H-909867.pdf>。没有资料证明它覆盖采购型号。 | 无客户/工程接受条件，当前卡在型号覆盖关系。 | 要供应商或 TE 原厂补 ordering guide、替代证明、同订货项说明或书面确认。 | 低 |
| 83 | `R5F100LLAFB#30` | `R5F100LLAFB#10` | 不影响使用 | 无 | 后缀从 `#30` 变成 `#10`。 | Renesas 官方页面明确 `#30` 的 Replacement Part 是 `#10`，且主体 MCU、封装、容量、电压范围一致。`#30`：<https://www.renesas.com/en/products/rl78-g13/part-details/r5f100llafb-30>；`#10`：<https://www.renesas.com/en/products/rl78-g13/part-details/r5f100llafb-10> | 如客户对供货状态、包装或 MOQ 有要求，需要另确认；这不改变型号替代结论。 | 如采购数量或包装方式受限，让供应商/代理补包装、MOQ、供货状态确认。 | 高 |
| 86 | `UPD70F3451GC(R)-UBT-A` | `UPD70F3451GC(S)-UBT-A` | 影响使用 | 关系证据不足 | 括号后缀从 `(R)` 变成 `(S)`。 | Renesas 两个页面规格字段相近：`(R)` <https://www.renesas.com/en/products/v850e-if3/part-details/upd70f3451gc%28r%29-ubt-a>；`(S)` <https://www.renesas.com/en/products/v850e-if3/part-details/upd70f3451gc%28s%29-ubt-a>。但没有资料说明 `(R)` 与 `(S)` 是同料、替代料或可互换后缀。 | 无客户/工程接受条件，当前卡在后缀关系。 | 要供应商或 Renesas/授权代理补后缀说明、订货编码表、替代证明或书面确认。 | 中 |
| 118 | `MMF-12C12DH-RO0` | `MMF-12C12DH-R00` | 影响使用 | 差异资料不足 | 后缀里 `O` 和数字 `0` 混淆，`RO0` vs `R00`。 | 只能看到 `MMF-12C12DH` 基础风扇规格或相近后缀线索，Daiwa/MELCO：<https://www.daiwa-ele.com/wp-content/pdf/mtr14.pdf>；Icom 线索：<https://www.radiomanual.info/schemi/ICOM_ACC/Icom_IC-PW1_IC-PW1Euro_serv_addendum_2011.pdf>。这些资料没有解释 `RO0/R00` 后缀含义。 | 无客户/工程接受条件，当前卡在后缀差异含义。 | 要供应商或原厂补订货编码表、后缀说明、铭牌照片、原包装标签，或书面确认 `RO0` 与 `R00` 是否同一料。 | 低 |
| 119 | `XV-3510CB 50.300000KHZ` | `XV-3510CB 50.3KHZ` | 不影响使用 | 无 | 频率小数写法不同，`50.300000 kHz` 与 `50.3 kHz` 数值相同。 | 四个条件同时满足：主体型号同为 `XV-3510CB`；单位同为 `kHz`；`50.300000` 与 `50.3` 数值等价；Epson 资料能说明这是 `XV-3510CB` 的频率字段。Epson：<https://www.epsondevice.com/crystal/en/products/sensor/xv3510cb.html>；Epson PDF：<https://www.nscn.com.cn/epson_pdf/gyro/XV-3510CB_gyro.pdf>；Chip1Stop 和 Asahi 显示两种写法线索：<https://www.chip1stop.com/USA/en/products/Seiko-Epson/XV-3510CB--50.300000-kHz/TYTU%2A0067897>；<https://www.asahi-eng.co.jp/item/epson/xv3510cb503khz/> | 无。 | 让供应商在报价/标签上确认品牌、主体型号和频率字段一致即可。 | 中 |
| 121 | `MMF-12C12DH-RO0` | `MMF-12C12DH-R00` | 影响使用 | 差异资料不足 | 后缀里 `O` 和数字 `0` 混淆，`RO0` vs `R00`。 | 只能看到 `MMF-12C12DH` 系列或相近后缀资料，Daiwa/Daichi：<https://www.daiwa-ele.com/wp-content/pdf/mtr14.pdf>；FanDevice：<https://www.fandevice.com/product/mitsubishi-mmf-12c12dh-rp1-ca49007-0131-dc-12v-0-5a-12038-axial-cooling-fan.html>。没有资料解释 `RO0/R00` 后缀含义。 | 无客户/工程接受条件，当前卡在后缀差异含义。 | 要供应商或原厂补订货编码表、后缀说明、铭牌照片、原包装标签，或书面确认。 | 低 |
| 149 | `222K132-25/225` | `222K132-25/225-0` | 影响使用 | 关系证据不足 | 尾部多了 `-0`。 | TE 官方资料能说明 `222K132-25/225-0` 的规格和内部号 `131250-000`，TE：<https://www.te.com/en/product-131250-000.html>；Newark：<https://www.newark.com/raychem-te-connectivity/222k132-25-225-0/heat-shrink-boot-30mm-elastomer/dp/55T8087>；TME：<https://www.tme.com/us/en-us/details/222k132-25_225-0/heat-shrink-tubes/te-connectivity/>。但没有原厂或授权渠道把无 `-0` 和带 `-0` 绑定到同一内部号、同一订货项、官方替代或 cross-reference；普通 alternate-name 线索不能直接放行。 | 无客户/工程接受条件，当前卡在 `-0` 是否可省略或等价。 | 要供应商或 TE/Raychem 补订货编码表，或书面确认 `222K132-25/225` 与 `222K132-25/225-0` 是否同一料。 | 中 |
| 155 | `MS2518-2` | `MS25182-2` | 影响使用 | 差异资料不足 | 主体数字少一位，`MS2518-2` vs `MS25182-2`。 | 能看到 `MS25182-2` 是军标/航空连接器，Boeing：<https://shop.boeing.com/cpd/bdsis4_ms25182-2>；Military Fasteners：<https://military-fasteners.com/electrical/ms_series/MS25182-2>；Air Power：<https://www.airpowerinc.com/ms25182-2>。但没有资料说明少一位数字是合法简写、同列关系或可替代。 | 无客户/工程接受条件，当前卡在少一位数字的差异含义。 | 要供应商或标准件渠道补军标/原厂订货编码表，或书面确认少一位数字是否为合法写法或可替代关系。 | 中 |
| 171 | `SV630NT0171` | `SV630NT017I` | 影响使用 | 关系证据不足 | 尾位从数字 `1` 变成字母 `I`。 | 汇川/Inovance 资料指向 `SV630NT017I` 是一个有效规格写法，Aitek 手册：<https://wiki.aitekweb.com/general_assets/user_manual/drivers/inovance_sv630n.pdf>；Alibaba：<https://www.alibaba.com/product-detail/Servo-Motor-Inovance-Driver-and-Motor_1601125538230.html>；eBay：<https://www.ebay.com/itm/357921154945>。但没有资料证明 `1/I` 等价或同列。 | 无客户/工程接受条件，当前卡在 `1/I` 是否同一型号。 | 要供应商或汇川/授权渠道补官方型号表、尾位说明、铭牌照片、包装标签，或书面确认尾位是数字 `1` 还是字母 `I`。 | 中 |
| 197 | `SV630NT0171` | `SV630NT017I` | 影响使用 | 关系证据不足 | 尾位从数字 `1` 变成字母 `I`。 | 公开资料能说明 `SV630NT017I` 的规格，Manuals+：<https://manuals.plus/fa/ae/1005010747718111>；Aitek 手册：<https://wiki.aitekweb.com/general_assets/user_manual/drivers/inovance_sv630n.pdf>；Alibaba：<https://www.alibaba.com/product-detail/Servo-Motor-Inovance-Driver-and-Motor_1601125538230.html>。但没有资料证明 `1/I` 等价或同列。 | 无客户/工程接受条件，当前卡在 `1/I` 是否同一型号。 | 要供应商或汇川/授权渠道补官方型号表、尾位说明、铭牌照片、包装标签，或书面确认。 | 低 |
| 222 | `CL8064701528501` | `i5-4402E CL8064701528501` | 不影响使用 | 无 | 报价文本包含市场名和同一个 Intel ordering code。 | Intel 官方资料把 `i5-4402E` 与订货号 `CL8064701528501` 直接对应，Intel：<https://www.intel.com/content/www/us/en/products/sku/76307/intel-core-i54402e-processor-3m-cache-up-to-2-70-ghz/ordering.html>；Intel PCN：<https://cdrdv2-public.intel.com/804391/PCN119368-00.pdf> | 无。 | 确认实物标签或包装上的 Ordering Code 为 `CL8064701528501`。 | 高 |
| 226 | `CL8064701472605` | `i7-4720HQ CL8064701472207` | 影响使用 | 无 | Intel ordering code 不同，且对应不同处理器。 | Intel 官方资料显示 `CL8064701472605` 属于 `i7-4722HQ`，`CL8064701472207` 属于 `i7-4720HQ`，Intel：<https://www.intel.com/content/www/us/en/products/sku/78935/intel-core-i74722hq-processor-6m-cache-up-to-3-40-ghz/ordering.html>；<https://www.intel.com/content/www/us/en/products/sku/78934/intel-core-i74720hq-processor-6m-cache-up-to-3-60-ghz/ordering.html>；Intel PCN：<https://cdrdv2-public.intel.com/799686/PCN114555-01.pdf> | 无。 | 不接收该报价型号；若供应商坚持替代，需客户或工程书面确认可从 `i7-4722HQ` 改为 `i7-4720HQ`。 | 高 |
| 298 | `43030-0001` | `430300001` | 不影响使用 | 无 | 横杠写法不同，主体数字相同。 | Molex 官方系列表使用无横杠料号 `430300001`，公开渠道把它与 `43030-0001` 同列，Molex：<https://www.molex.com/en-us/products/series-chart/43030>；Datasheets.com：<https://www.datasheets.com/Molex/43030-0001/>；TrustedParts：<https://www.trustedparts.com/en/part/molex/430300001> | 未查到 Molex 单一官方页面标题同时把两种写法写成互为别名，但已有资料足够说明同一料号写法。 | 确认报价实物或包装标签料号为 `430300001/43030-0001`，包装形态按需求一致。 | 高 |

## 补充验收样例：使用条件不足

这个样例用于验证第三类不足：差异已经查清，但客户或工程是否接受这个差异不明确。

| case | 采购型号 | 报价型号 | 结论 | 不足类型 | 差异是什么 | 覆盖/替代依据 | 客户/工程条件 | 需要补什么材料 | 置信度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U1 | `PART-A-BLACK-TRAY-85C` | `PART-A-WHITE-REEL-105C` | 影响使用 | 使用条件不足 | 颜色、包装方式、温度等级不同；假设公开资料已能说明这些字段含义。 | 同系列同主体，但公开资料只能说明字段差异，不能证明客户接受颜色/包装/温度变化。 | 缺客户/工程是否接受白色、卷带包装、105C 等级替代原要求的确认。 | 要客户或工程确认颜色、包装方式、温度等级是否为强制要求；如包装影响装配，还要工程确认产线可用。 | 中 |

## 重跑后的观察

1. 两类结论能覆盖全部真实 case，不需要第三种业务结论。
2. 不足类型只回答三个问题：差异是否查清、覆盖/替代关系是否有证据、客户/工程是否接受差异。
3. `55P00211-16-9` vs `55PC0211-16-9` 统一为 `关系证据不足`：报价型号规格不是覆盖采购型号的证据。
4. `使用条件不足` 需要单独验收，因为它不是资料没查清，而是业务使用要求没给清。
5. 补料动作必须写清找谁：供应商/原厂补差异或关系资料；客户/工程确认使用条件。
