# dsh-eda-review —— 嘉立创EDA专业版工程审查技能（DSH Skill Bundle）

> 版本 v1.1.0 ｜ 仓库 <https://github.com/chaser-star/dsh-eda-review> ｜ 许可证 Apache-2.0

## 一句话

把 `.epro2` / `.epru` 工程文件变成**可核对、可追溯**的审查结论：权威网表重建、引脚与封装核对、PCB 几何检查、版本增量审查。

## 它解决什么问题

- `.epru` 是**编辑历史流**：同一元件/焊盘存在多条记录，直接读会误判「仍悬空」「丝印没改」；
- DRC 只验证工具内自洽：S3 脚悬空、封装与 BOM 不符、极性接反，DRC 照常通过；
- 打样前缺少一套按严重度分级、能落到具体记录的检查清单。

## 核心能力

- 解析 `.epro2`（ZIP 容器）与 `.epru`（逐行记录流），按 ticket 取最新值，重建**权威网表**（位号/焊盘/引脚/网络全集）；
- 原理图几何交叉验证：符号引脚坐标变换、并集查找并网、NC 标记核对；
- 引脚/封装逐脚核对：符号引脚号 ≠ 物理焊盘号，以官方数据手册渲染图为准；
- PCB 几何：板框、叠层、线宽、过孔、铺铜、丝印、阵列朝向、安装孔；
- 版本增量审查：元素级语义 diff，剔除重存/重编号/铺铜重算噪声；
- BOM 三方对齐：工程 ↔ 立创官方库 ↔ BOM（位号集合、封装名、引脚表）；
- 官方 PDF 数据手册本地提取（纯 Python 标准库，按坐标还原表格）；
- 板型/层数通用化：2/4/6+ 层自适应、盲埋孔/HDI、拼板与工艺边、表面处理。

## 安装

```powershell
# 本地 link（开发）
D:\plugin\link-plugin.cmd dsh-eda-review-plugin

# GitHub 源
dsh plugin add github:chaser-star/dsh-eda-review
```

安装后重启 DSH 生效。

## 使用

提供 `.epro2` / `.epru` 文件，或提出工程审查、网表审查、原理图检查、PCB 图形检查、打样前检查、版本对比等需求时触发技能 `eda-project-review`。

## 安全与权限

只读插件：**无文件写入、无网络、无子进程、无安装脚本**；仅读取包内 `SKILL.md`；frontmatter ≤ 64 KiB、单文件 ≤ 1 MiB；不接触任何凭据。依赖 `yaml` 缺失时自动降级到内置解析器，不会因缺依赖崩溃。

## 兼容性

| DSH 版本 | 证据 |
| :--- | :--- |
| `0.2.1-rc.3` | 运行时实测（安装 + dump-config + 技能注册） |
| `0.1.5-rc.3` | 运行时实测（旧 CLI + Node 24） |
| `0.1.2-rc.1` / `0.1.0-rc.2` / `0.0.1-rc.5` | 扩展点与字段契约一致（包级检查） |

宿主缺少 `skills.registerProvider` 时保持惰性并输出 warning，不阻断 Profile 启动。

## 质量

- 79 项测试（契约 11 + 安全 9 + 黄金用例 39 + 差分 300 例 + 健壮性 17）；
- 差分语料误差 **0.00%**（门限 <5%）；行覆盖率 96.11%、分支 89.91%；
- 官方静态审计 80/80，0 硬阻断。

## 许可与免责

Apache-2.0。仅用于**自有或已获授权**文件；不解析、不解密任何加密、受保护或第三方保密文件；输出不构成设计保证或验收结论；后果自担，不附带任何明示或默示担保。

## 上架状态

- dsh.so / dshmarket：**Declared**（已收录）；兼容性报告：[Discussion #10916](https://github.com/deepseek-ai/deepseek-harness/discussions/10916)；
- 仓库 `main` = `8aa477e`，标签 `v1.1.0`。

## 相关文档

- [TESTING.md](TESTING.md) —— 三轮测试、精度与覆盖率证据
- [COMPATIBILITY.md](COMPATIBILITY.md) —— 版本兼容矩阵与降级行为
- [MARKETPLACE.md](MARKETPLACE.md) —— 上架清单与证据门
- [SECURITY.md](../SECURITY.md) —— 权限面与信任边界
