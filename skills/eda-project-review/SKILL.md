---
name: eda-project-review
description: |
  解析并审查嘉立创EDA专业版（EasyEDA Pro / LCEDA Pro）工程文件（.epro2 / .epru）的电路设计与原理图/PCB 图形。
  可提取权威网表（区分编辑历史残留）、元件引脚映射、封装焊盘几何、PCB 几何（板框/叠层/线宽/过孔/阵列坐标/铺铜/丝印），
  并对照官方数据手册逐引脚核对。当用户提供 .epro2/.epru 文件、或要求审查 EDA 工程/网表/原理图/PCB 设计/打样前检查时使用。
  触发词：epro2、epru、立创EDA专业版、嘉立创EDA、EDA审查、网表审查、电路设计审查、原理图检查、PCB图形检查、版本对比、增量审查、DRC复核。
---

# 嘉立创EDA专业版工程文件（.epro2/.epru）解析与审查

深度解析 `.epro2` 工程内部数据，重建**权威网表**并完成电路与图形审查。
全部结论必须来自工程内部数据 + 官方数据手册；数据缺失时明确标注"需用户核实"，绝不猜测。

## 0. 文件容器结构

- `.epro2` 是 **ZIP 归档**（文件头 `50 4B 03 04`）。Windows PowerShell 5.1 的 `Expand-Archive`
  只认 `.zip` 扩展名，先复制为 `.zip` 再解压。
- 解压后得到：
  - `project2.json`：项目元数据（标题/编辑器版本）；
  - `<工程名>.epru`：**核心工程数据**（数 MB 的 UTF-8 文本记录流）；
  - `IMAGE/*.webp`：原理图/PCB 预览图（模型不支持图像输入时忽略，以元素数据为准）。

## 1. 解析 .epru 记录流

`.epru` 不是单个 JSON 文档，而是**逐行记录流**，每行格式：

```
{record}||{attrs}
```

- `record`：元素记录 JSON，含 `type`、`ticket`、`id`、`firstTicket` 等字段；
- `attrs`：可选属性 JSON，与 record 以 `||` 分隔，行尾可能有 `|`；
- 解析：逐行 `split('||', 2)`，两个 JSON 分别 `ConvertFrom-Json`，把 attrs 挂到记录上
  （如 `__attrs` 属性）。全部 12916 行应零失败。

主要记录类型（`type` 字段）：

| type | 含义 |
| :--- | :--- |
| `DOCHEAD` | 文档边界，attrs 含 `docType`（FOOTPRINT/SYMBOL/DEVICE/BOARD/SCH/SCH_PAGE/PCB/CONFIG/FONT/BLOB）与 `uuid` |
| `COMPONENT` | 元件实例（原理图符号实例 / PCB 封装实例），含 x/y/angle/rotation/layerId |
| `PIN` | 符号引脚定义（仅在 SYMBOL 文档内），本地坐标 lx/ly |
| `ATTR` | 属性（Designator/Name/Symbol/Footprint/Value/Pin Number/Pin Name/NO_CONNECT/NET/Global Net Name 等），parentId 指向所属元素 |
| `PAD_NET` | 焊盘-网络映射，`id` 为 JSON 数组 `["PAD_NET", 元件id, 焊盘号, 引脚id]`，attrs 含 `padNet` |
| `PAD` | 封装焊盘（几何，num/centerX/centerY，仅在 FOOTPRINT 文档内） |
| `LINE` | 线段（原理图导线带 `lineGroup`+netName；PCB 走线带 layerId/width/netName） |
| `WIRE` | 原理图导线组对象（id = lineGroup） |
| `NET` | 网络定义，`id` = `["NET","网络名"]` |
| `VIA` | 过孔（netName/holeDiameter/centerX/Y） |
| `META` | 文档元信息（标题、属性块） |
| `POLY/POUR/POURED/REGION/FILL` | 板框/铺铜/禁布区/铜皮填充 |
| `STRING/TEXT` | 文字（丝印/注释） |

**文档分段**：记录按 `DOCHEAD` 出现顺序划归文档；`SCH_PAGE`（原理图页）与 `PCB` 是两个关键文档。

## 2. 权威网表重建（PCB 侧）

1. 收集 PCB 文档的 `COMPONENT`（含 Designator ATTR 的才是**当前元件**；无数号的是已删除历史残留）；
2. 对每个 `PAD_NET`，按 **(元件id, 焊盘号) 取最大 ticket 的记录**（该格式保存完整编辑历史，
   同一键存在多版本，空 `padNet` 通常是旧记录/删除痕迹）；
3. 元件 → Symbol uuid（ATTR）→ 符号文档 → 引脚 id → `Pin Number`/`Pin Name`（ATTR）。
   **引脚 id（如 e14）只在所属符号文档内唯一**，必须经元件所属符号解析；
4. 输出 `位号, 焊盘号, 引脚号, 引脚名, 网络` 全集——这是审查基准。

**校验经验值**：有效行数应 ≈ 各元件焊盘总数；原理图几何重建（下一节）的"有网络+NC"引脚数
应与之完全吻合。不一致说明有历史残留混入（本案 692 行中 353 行为历史残留）。

## 3. 原理图几何重建（交叉验证 / PCB 网表过期时兜底）

当 PCB 的 PAD_NET 不完整时，从原理图几何重建：

1. 符号引脚本地坐标 (lx,ly) 经元件摆放变换为绝对坐标（CCW 约定，已实测验证）：
   `x' = x + lx·cosθ − ly·sinθ`，`y' = y + lx·sinθ + ly·cosθ`（θ 取 rotation，缺省用 angle；镜像先翻转 lx）；
2. 线段按 `lineGroup` 归组（=WIRE id）；**并集查找（union-find）**：同坐标点上的
   线段端点/引脚/端口实例全部合并；
3. 网络命名来源：① WIRE 的 `NET` ATTR（按 ticket 取最新）；② 端口实例（Symbol =
   Ground-GND/Netport-IN/OUT，名字取 `Global Net Name` 或 `Name` ATTR）。同一集合出现
   两个不同名字 = 真短路或历史残留线段，需人工甄别；
4. NC 引脚：`ATTR key=NO_CONNECT`，parentId = `元件id-引脚id`，value=yes；
5. 注意：**旧线段不会自动消失**——同一位置的新旧线组并存，需用 WIRE 记录是否存在/票号
   新旧过滤，否则产生假冲突（本案 NOR_ADC1+4 等 16 个假冲突即源于此）。

## 4. 引脚与封装核对（最容易抓 P0 的一步）

- **物理引脚号 = 封装焊盘号**（footprint 的 `PAD.num`）。先用焊盘坐标验证封装编号方向：
  标准 SOP/SSOP/QFN 为 1 脚左上、逆时针。
- **符号引脚号 ≠ 物理引脚号**：把符号引脚表与官方数据手册逐脚比对。
- **官方手册优先，记忆不可替代手册；单证据源不得直接下 P0**（2026-10 两次误判实录）：
  ① 凭"记忆中标准 4067 引脚"判定"12~24 脚整体错位、VCC 接地整板失电" → 错（官方 12=GND）；
  ② 改按 PDF 矢量文本坐标匹配，得出"13=S2、14=S3 互换" → 又错（官方 **13=S3、14=S2**）——
  原因是**矢量图中引脚名被绘制在比编号高约一行（≈1 行距）的位置**，按最近 y 配对会错行；
  ③ 最终用**渲染后的整页截图 + 本机 Windows OCR**（读出 `24 Vcc`、`15 E`、`14 S2`、`12 GND`）
  确认，工程符号 24/24 脚全对。**结论：引脚功能必须以官方 PDF 的"渲染图"为准；矢量文本坐标只
  能作辅助，且必须用相邻两行交叉校验偏移规律；无图可用时标注"需核实"，不得凭记忆或单一坐标源
  下 P0，若已出具错误结论要显式更正。**
- **CD74HC4067（TI SCHS209，24 脚 D/W/DB/N/PW，图 4-1 已核实）官方引脚表**：

  | 脚 | 名 | 脚 | 名 | 脚 | 名 | 脚 | 名 |
  | :--: | :-- | :--: | :-- | :--: | :-- | :--: | :-- |
  | 1 | COMMON IN/OUT | 7 | I2 | 13 | **S3** | 19 | I12 |
  | 2 | I7 | 8 | I1 | 14 | **S2** | 20 | I11 |
  | 3 | I6 | 9 | I0 | 15 | E̅（低有效） | 21 | I10 |
  | 4 | I5 | 10 | S0 | 16 | I15 | 22 | I9 |
  | 5 | I4 | 11 | S1 | 17 | I14 | 23 | I8 |
  | 6 | I3 | 12 | GND | 18 | I13 | 24 | VCC |

  注意：通道号与引脚号**不是**顺序对应（2→I7…9→I0、16→I15…23→I8）；地址线为
  **S0=10、S1=11、S2=14、S3=13**、使能 E=15。**本器件最典型的真实缺陷是 S3(13) 悬空未接 GND**
  （本例工程正是如此）：S3 是地址最高位，浮空后通道在 I0~I7 与 I8~I15（后者通常接地）之间随机
  跳变，读出"空通道"0 值——**DRC 完全看不出来**。
- **"不使用某引脚"≠"可以悬空"（需求基线核对，必查项）**：
  - 需求里写"不使用 S3 / 只用 N 个通道"时，必须把它翻译成可验证的硬件约束：
    **未用地址线硬接 GND（或 VCC）**、未用通道输入接地、通道数 = 传感器数量；
  - 逐项核对三份来源并列出对照表：**需求文档原文 ↔ 用户口述 ↔ 工程实际**（位号+焊盘+网络），
    三者不一致时按"需用户确认"处理，不得擅自选边；
  - 典型实例（测光表 V2）：需求文档写"每片 I0~I7（8 通道）、S3 恒低"，用户起初口述"只用 7 通道"，
    工程实际接满 8 通道、传感器恰为 16 颗；向用户确认后获知"7 通道"系按位号的习惯性说法，
    真实基线为 **8 通道** → **口述与文档冲突时先向用户确认，确认结果回写报告基线表，不得擅自选边**；
  - 无论 7 还是 8 通道，**S2 都必须由地址网络驱动（14 脚）、S3 必须恒低（13 脚接 GND）**——
    "不用 S3" 恰恰意味着 13 脚必须硬接地，而不是留空或打 NC（本例缺陷即"13 脚被打 NO_CONNECT"）；
  - 遗留死网络（如无任何引脚连接的 `S3CD`）要一并指出并建议删除。
- 光敏管/传感器类还要核对 E/C（集电极/发射极）方向与封装标记。
- BOM 料号 vs 封装尺寸（如 ME6211C33R5G=SOT-89-3 与 SOT-23-5 封装）必须逐一比对。

## 5. PCB 几何与图形检查

- 板框：`POLY` layerId=11 polyType=BOARD_OUTLINE，路径 `["R",x1,y1,w,h,rot,radius]` 为
  角点+带符号宽高（本案 [-4940,2000,4940,2000] = 125.5×50.8mm）；
- 叠层：`LAYER_PHYS`（外铜 1oz + 7628 介质 + 内层 GND/VCC 平面）；线宽：按 netName 对
  `LINE.width` 做直方图；过孔：`VIA.netName` 直方图（缝合孔统计）；
- 铺铜：`POUR`（定义）与 `POURED`（填充多边形）；禁布区 `REGION`（prohibitType）——
  对照设计要求检查光路/净空区是否真的挖空；
- 丝印：`STRING` 的 layerId（3=顶层丝印/4=底层丝印）+ 坐标，与元件所在层（COMPONENT.layerId）
  及 BOM 值交叉核对（"丝印值 vs 实际阻值"矛盾是常见 P1）；
- 阵列几何：由元件坐标计算环半径/朝向偏差；安装孔：检查是否存在大孔径孔（本案 158 个过孔
  全为 0.3mm，且无安装孔——属装配级 P2）；
- **图形审查完整清单（第二轮实战总结）**：
  - 丝印值 vs BOM 阻值/容值逐条交叉核对——**必须按坐标把每段文字归到最近元件**（用 `sqrt(dx²+dy²)`
    找最近 COMPONENT），因为同一元件可能有多段文字、且**旧标注串会被保留**：本例 R37 的 `10K` 在
    (-1070,430)（距 R37 105mil）其实已正确，真正的问题是一段旧合并标注 `100KR36 51KR37`
    （-1035,895）仍写着 51K——**只看字符串内容会误判"丝印没改"**；
  - 铺铜/禁布区 vs 设计文档声明（文档说"阵列区顶层禁止铺铜"，实际整板 GND 铺铜且无阵列区挖空 → P1）；
  - `NO_CONNECT` 标记完整性：悬空引脚数 = NC 标记数（30 个 NC 覆盖 28 个悬空脚 + 2 个带短线残段的 S3）；
  - 原理图悬空短线（stub）统计：按"线段端点只挂 1 段且无引脚"计数，排除拐点（同组两段共享端点）；
  - 网络名拼写（MEASSURE→MEASURE、LOW_BATTARY W→LOW_BATTERY）与页名/标题栏空缺；
  - 位号/功能标签丝印层与元件所在层一致性（排针在上层、标签打在底层丝印 = 错层）；
  - 功能标签与信号一致性（丝印 "SWO" 但工程无 SWO 网络、PB3 接地 → 标签错误）；
  - 3D 模型覆盖率（80/99）；调试口/连接器功能标签齐全性（4 针口缺 DIO/GND 标注）；
  - 传感器阵列朝向：`pad2 相对 pad1 的向量` 按元件 angle 旋转后与"指向阵列质心"方向求偏差
    （本案 16 颗环传感器偏差 ≤1.9°，验证文档 ±2.1° 声明）。

## 6. 数据手册核对

- TI 官方 document-viewer 页面的引脚表以**图片渲染，fetch 不到文字**——改用镜像/OCR 页，
  仍拿不到就按审查规则标注"需核实"，禁止脑补；
- 关键器件核对点：CD4067（S3/E#/VCC/GND）、TPS2116（PR1/MODE 数字输入不接分压）、
  XC61C（推挽输出、检测电压）、TP4056（I=1200/PROG[kΩ]）、
  **DW01+8205（CSI 必须经 1k 接 PACK- 即系统 GND 侧——过流阈值定义在 CSI−VSS≈0.15V，
  接 B- 会使 CSI−VSS=0 而过流检测失效；8205S 拓扑为 S1→B-、S2→PACK-、栅极经 1k 接 OD/OC）**、
  STM32（BOOT0/NRST/VCAP/VDDA）。

## 7. 输出审查报告（固定格式）

按严重等级输出：🔴 P0 致命 / 🟠 P1 严重隐患 / 🟡 P2 优化建议；每条含
📍位置（位号/网络/引脚）、🔍当前状态、💣隐患分析（带计算或手册依据）、🛠️修改建议；
另附 ✅设计亮点、📖关键参数验算附录、⚠️数据缺失清单。结尾给出修复优先级与打样判定。

## 8. PowerShell 解析环境陷阱（实战踩坑记录）

- **`$pid` 是只读自动变量**（进程 ID，大小写不敏感）——变量命名避开 `$pid/$home/$host` 等；
- PS5.1 的 `ConvertFrom-Json` **无 `-Depth` 参数**；嵌套结构用 `ConvertTo-Json -Depth N` 输出时注意；
- **BOM 缺失的 UTF-8 `.ps1` 被 PS5.1 按 ANSI/GBK 读取**：含中文注释的脚本可能解析错乱
  （出现莫名其妙的 null 变量）——**脚本一律纯 ASCII**，中文只进数据/输出；
- 外层 pwsh 会把双引号命令里的 `$var` 提前展开——内层脚本用 `-File` 执行或反引号转义；
- 大 JSON 用 `Get-Content -Raw | ConvertFrom-Json` 即可（PS5.1 对 4MB JSON 无深度限制）。

## 9. 边界与限制

- 模型不支持图像输入时：预览图（webp）无法读取，改用元素几何数据（更可靠）；不要声称看过图；
- 编辑历史记录（低票号/无位号/空 padNet）是**数据噪音**，不是设计错误；先按最大 ticket 过滤再审查；
- 结论必须可追溯到具体记录（位号+焊盘+票号），并在报告中给出"需用户核实"清单。

## 10. 版本增量审查（用户提交更新版工程 / "已过 DRC"复核）

用户往往提交**修改后的新版 .epro2**（如"已通过 DRC"）。不要整盘重审，先做**元素级语义 diff**：

1. 两个 `.epru` 各自解析为记录流；按 `类型 + id(JSON 字符串)` 建映射，每键取**最大 ticket** 的属性 JSON；
2. 对比两版映射：`added / removed / changed` 三集合即为真实改动；
3. **噪音过滤**（本案 2216 行差异中只有 4 处真实变化）：
   - 换客户端/机器重存 → DOCHEAD 的 `client` GUID 变化、全文件 ticket 重编号（无设计含义）；
   - 符号库内部维护 → PIN/RECT 等元素的 `partId` 修正、符号体翻转（无电性影响）；
   - 判定方法：对每个 changed 元素，反查"哪些位号引用它"（Designator → Symbol uuid → META title），
     确认引用对象的 BOM 值/网络是否变化；
4. 权威网表重建后与上一版**逐行比对**（333 焊盘逐条一致/不一致清单）；
5. **关键认知：DRC 通过 ≠ 电路正确**。DRC 只验证工程在工具自身模型下的自洽性（间距/短路/未连网络）；
   功能错误（如 CD4067 的 **S3(13 脚) 悬空未接 GND** → 地址最高位随机、通道在 I0~I7/I8~I15 间跳变，
   或 BOM 封装不符、E/C 极性反、CSI 接错）在工具内"自洽"，DRC 照常通过。报告中必须向用户点明，
   并给出"增量审查结论：X 项修复 / Y 项未修复，仍不可打样"的明确判定。

## 11. 官方 PDF 数据手册的本地提取（无网络依赖，高保真）

用户提供官方 PDF 时，用 Python 标准库直接解析文本层并**按坐标还原表格**（比 OCR/镜像可靠）：

```python
# 1) 对象扫描：re.finditer(rb'(\d+) (\d+) obj(.*?)endobj', data, re.S)
# 2) 解压流：zlib.decompress(raw) 或 zlib.decompress(raw, -15)；跳过含 /Image 的对象
# 3) ToUnicode：/ToUnicode N 0 R → 解压 → beginbfchar/beginbfrange 建 code→unicode 映射
# 4) 内容流线性分词（勿用复杂正则，2MB+ 二进制会指数回溯）：
#    识别 (字符串)、<hex字符串>、/名字、数字、操作符；维护 Tm/Td/TD/T*/Tf 文本矩阵
# 5) 每个 Tj/TJ 记录 (x, y, text)；按 y 分组、组内按 x 排序 → 行结构；列由 x 带区分
```

**关键细节与坑**：
- **十六进制字符串**（`<0048...>`，Type0/CID 字体）必须按字节处理，再用该字体的 ToUnicode 解码；
  漏掉 `<...>` 会大面积丢字（实测一页表只剩描述列）；
- **上下标偏移**：引脚名如 "I7" 常画成 'I'（基线）+ '7'（下标，y 偏 ~1.6 单位）→ 按"字母 + 相邻
  下标"配对，再按引脚号列的 y 对齐；
- **整行名称可能整体偏移**（本轮误判根因）：引脚名比对应编号行高约 1 个行距时，按"最近 y"配对会把
  名称错配到相邻脚（实测导致把 13=S3、14=S2 误判成互换）。**规则：矢量文本只作辅助；引脚结论必须
  用"渲染后的整页图/截图"复核（本机可用 Windows OCR 读出 `14 S2`、`15 E` 等行），或改用图像读取工具；
  偏移不规律时宁标注"需核实"，不要下 P0**；
- **文字坐标可能是相对偏移**：必须正确实现 Tm（绝对矩阵）/Td（相对行移动）/T*（leading）才能拿到真实 y；
- **重复/重影项**：同一 (x,y) 可能出现两次同名文本（绘图工具重影），去重后再配对；
- **中文版手册的 CJK 字体常无 ToUnicode**：描述列可解、器件名/数字列可能解不出——此时仍可用
  "引脚号列 + 图注"交叉验证（本技能 §4 的 CD4067 官方表即由此法核实）；
- Windows 控制台默认 GBK，Python 打印含 µ/° 会 UnicodeEncodeError → 设 `$env:PYTHONIOENCODING='utf-8'`；
- 提取结果与工程符号逐脚比对后，若与以往结论冲突：**以 PDF 为准，并在报告里显式更正旧结论**。

**图片（位图）层核查——先判载体，再决定手段**：
- **TI 手册的引脚配置图通常是"矢量文本 + 路径线"**，不是位图：直接用上面的位置化文本提取即可，
  引脚号与名称同 y 对齐就是铁证（本例 12 与 GND 完全同行）。**不要把位图里的测试电路误当引脚图**；
- 位图 XObject 用 `/Filter` 识别：`DCTDecode`（注意字典常写成 `/Filter/DCTDecode` 无空格，正则要兼容）
  → 流直接存 `.jpg`；`FlateDecode`+`DeviceRGB` → `PIL.Image.frombytes` 存 PNG；`CCITTFaxDecode` 需专门解码；
- **无视觉模型时的 OCR 方案（Windows 内置，离线）**：必须在 **Windows PowerShell 5.1** 调 WinRT
  （PS7 不支持）；`StorageFile.GetFileFromPathAsync` 在该环境常失败，改用 GDI+ 解码：
  `Bitmap.FromFile → LockBits → Marshal.Copy → WriteableBitmap/WindowsRuntimeBufferExtensions.AsBuffer →`
  `SoftwareBitmap.CreateCopyFromBuffer(Bgra8, w, h) → OcrEngine.RecognizeAsync`；把图**放大 3 倍**再 OCR
  可显著提升小字号识别率（本例 502×258→1506×774 后成功读出测试电路文字）；
- 图面排版瑕疵（如某名称绘制位置偏移一行）**不推翻编号证据**：以"引脚号列 + 解码器图编号 + 表列描述"
  三处交叉为准，并在报告中说明瑕疵位置。

## 12. 技能库安装与迁移维护（DSH 宿主生态）

本技能（eda-project-review）在 DSH 中的形态与维护要点：

- **打包形态**：bundle 插件 = `skills/<skill-name>/SKILL.md` + `index.js`（注册 ctx.skills 提供者，
  扫描本包 skills 目录，frontmatter 校验 name/description 与 kebab-case）+ `cordis.patch.yml` +
  `package.json`（`dsh.bundle.patch` 指向 patch）；注册方式：配置目录 `package.json` 的
  `dsh.profile.bundles` 数组 + dependencies；
- **pnpm `.ignored` 陷阱**：手工放进 `node_modules` 的包在下一次 pnpm 安装时会被移到
  `node_modules\.ignored\` 并丢失加载——**必须用 `dsh plugin --profile <p> add "link:<绝对路径>"`
  注册为 link 依赖**（CLI 自动写 dependencies + bundles + pnpm 安装，`node_modules\<pkg>` 成为
  指向本地目录的符号链接）；
- **技能库整体迁移**（如迁到 D:\SKILL）：移动实体文件 + 在原始路径创建**目录联接（Junction）**
  （`New-Item -ItemType Junction`，无需管理员权限），不改任何代码/环境变量/映射；注意
  `Get-ChildItem -Recurse` 不遍历联接点，验证需用直接路径 `Test-Path`；
- **v-skill-links 映射插件**：把任意本地目录的**一级子目录**（含 SKILL.md）变成 `/` 菜单技能；
  配置写在补丁层 cordis.patch.yml 的 entry config（`- id: dsh-v-skill-links` + `config.directories`），
  或经设置页写入 `$DSH_HOME/v-skill-links.config.json`；**目录必须给到"含技能子目录的那一级"**
  （D:/SKILL 本身的一级子目录是 plugins/runtime，扫不到技能，需给 plugins/xxx/skills 等）；
  验证：`Invoke-RestMethod http://127.0.0.1:<端口>/api/v-skill-links/list`（web_fetch 工具禁 localhost，
  需走 PowerShell）。

## 13. BOM 核对与立创官方库比对（封装/引脚最终裁决）

**用户同时给 .epro2 + BOM(xlsx) 时，必须做三方对齐：工程符号/封装 ↔ 立创官方库 ↔ BOM 行。**

1. **读 BOM**：`openpyxl` 读 xlsx，列通常为
   `No. | Quantity | Comment | Designator | Footprint | Value | Manufacturer Part | Manufacturer | Supplier Part | Supplier`；
   **最关键的一步是"位号集合"逐一对齐**：把 BOM 全部 Designator 展开成集合，与工程 Designator 集合求差——
   本例即由此发现"BOM 有 R42(1k)、工程无 R42"，BOM 100 件 vs 工程 99 件（采购单与板子不一致的风险）；
2. **查立创官方库（无需鉴权，web_fetch 可用）**：
   `https://easyeda.com/api/products/<供货编号C...>/components` → JSON 中
   - `result.dataStr.head.c_para.package`：**封装名**（如 `SOT-353_L2.1-W1.3-P0.65-LS2.3-BL`）；
   - `result.dataStr.shape[]` 中 `P~show~0~<引脚号>~...~<引脚名>~...`：**符号引脚表**（与工程符号逐脚比）；
   - `result.packageDetail.dataStr.shape[]` 中 `PAD~RECT~...~<焊盘号>...`：焊盘几何（可校验 1 脚方向）；
   - `wmsc.lcsc.com` 的 API 需鉴权且 PowerShell 直连常 TLS 失败，**用 easyeda.com/api 作替代源**；
3. **封装判断禁止凭记忆**：本例曾误记 ME6211C33R5G 为 SOT-89-3，官方库实为 **SOT-353(SOT-23-5)**，
   引脚 1=VIN/2=VSS/3=CE/4=NC/5=VOUT 与工程完全一致——**凡"料号 vs 封装"疑问一律以官方库/原厂手册为准**
   （记忆已两次翻车：4067 引脚、ME6211 封装）；
4. **核对结论分级**：①完全一致 → 结案；②封装名一致但引脚名不同 → 列差异脚逐条比；③封装名不同 →
   P0/P1（贴装不了）；④BOM 位号多/少 → 采购风险，单独列 P1；
5. **顺手核对丝印 vs BOM 值**：丝印标称值必须等于 BOM 的 Value/MPN（本例 R37 丝印 51K vs BOM 10kΩ）。

## 14. 历史记录 vs 最新数据（用户强调的必做项）

`.epru` 是**编辑历史流**：同一元素（含 PAD_NET）有多条记录，旧的是历史版本。**判定"当前状态"的唯一规则**：

1. **元素级取最新**：按 `类型|元素id` 分组，取 **ticket 最大** 的那条记录的属性；
   PAD_NET 也按 `(元件id, 焊盘号)` 取最大 ticket（例如 U19 焊盘 13 先后有 `""` 与 `GND` 两条记录，
   当前状态是 **GND**——若误取旧记录会得出"仍悬空"的错误结论）；
2. **两版对比用"最新映射"**：分别构建 {key → 最大ticket属性} 后比较 added/removed/changed；
3. **必须剔除的噪声**（否则会误报一堆"改动"）：
   - `ELE_PLACEHOLDER` 的 dataType/max 变化（保存时的批处理重编号）；
   - `DOCHEAD` 的 client / updateTime / version（换客户端重存）；
   - `LAYER_FILL` / `POURED` 多边形重算（铺铜重灌）；
   - 元件坐标 ±10~20mil 的微调、`ATTR` 的 zIndex 变化（布局/图层顺序）；
4. **修复验证必须落到记录**，写成可核对的三元组：
   - P0 类："`PAD_NET[<comp>,13,e75]` = GND 且 `NO_CONNECT …-e54` 由 yes 变 no"；
   - P1 类："新增元件 Designator=R42(1k) + 出现 `NET=CSI` + `PAD_NET[<DW01>,2] = CSI`"；
   - 只有记录级证据齐了才能写"已修复"，不能凭版本号或文件名判断。

**实战记录（2026-10-25 最新版）**：13003 条记录 vs 上一版 12916 条；语义 diff 得 added=93 / removed=8 /
changed=53，剔除噪声后真实设计变更约 10 项：U19/U20 的 13 脚接 GND（P0 修复）、新增 R42(1k) 串 CSI
（DW01 过流采样完善）、PR1 网标并入 5VIN、SWD 丝印由 "SWO" 改为 "SWD"、DW01 区重布线 +2 过孔。

## 15. 板型与层数通用化（不套用单一样板）

检查项必须由**本次工程的实际数据**推导，禁止套用某块 4 层板的样板；§5 的具体叠层/板框数字仅作案例证据。

**叠层：先读实际，再定检查项**
- 始终从 `LAYER_PHYS` 重建真实叠层：层数、层类型（信号/平面/混合）、铜厚（oz）、介质型号与厚度、层序；
- **2 层**：顶层/底层走线 + 通孔；不要求内层平面，不得以"缺 GND/VCC 平面"误报；
- **4 层及以上**：逐层核对内层平面完整性（分割是否正确、有无跨分割走线）、参考平面连续性、电源/地耦合；
- **盲埋孔 / HDI**：核对孔类型与叠层匹配（通孔/盲孔/埋孔）、孔环与激光孔焊盘；
- **阻抗控制**：有阻抗要求时，核对线宽/介质厚度与叠层参数的一致性；
- 叠层记录缺失或与图纸矛盾 → 标注「需核实」，不臆测层数。

**板型与拼板**
- 矩形/异形/开槽：按 `POLY` 实际路径检查外形闭合、内角圆角、开槽与铜皮间距；
- 拼板（PANEL）：工艺边宽度（常 ≥5mm）、Mark 点（对角 ≥3 个）、V-CUT/桥连、筋宽、元件到板边距离；
- 安装孔：孔径、铜柱/螺柱位、孔到铜皮与元件距离；无安装孔按装配风险单独提示，不计入电性缺陷。

**工艺与可制造性**
- 表面处理（HASL/ENIG/OSP/沉银）与焊盘/间距要求；阻焊桥、过孔盖油、测试点；
- 丝印最小线宽/字高与位号可读性；极性标记（二极管/电解/连接器）；
- 测试点与调试口：可探性、间距、治具需求。

**输出随板型自适应**
- 报告中的叠层/工艺检查项必须来自本次读数，不得复制 4 层示例；
- 缺叠层、板框、拼板数据时归入「数据缺失」，注明需用户提供；
- 同一缺陷在不同层数下严重度可变：2 层板无内层平面属正常；4 层板内层平面断裂属 P1。
