# dsh-eda-review

嘉立创EDA专业版（EasyEDA Pro）工程文件（`.epro2` / `.epru`）解析与电路/图形审查技能，打包为标准 DSH（DeepSeek Harness）Skill Bundle。
（不可解析加密文件，违者后果自负）
**只读技能包**：不联网、不写文件、不执行外部命令、无任何安装脚本。

## 能力

- 解析 `.epro2`（ZIP 容器）与 `.epru`（逐行记录流），重建**权威网表**；
- 区分编辑历史残留与当前状态（同元素多记录取最大 ticket）；
- 引脚 / 封装 / 数据手册逐脚核对（CD4067、DW01、ME6211 等实战规则）；
- PCB 几何检查：板框、叠层、线宽、过孔、铺铜、丝印、阵列朝向；
- 版本增量审查（元素级语义 diff，剔除重存/重编号噪声）；
- BOM 与立创官方库三方对齐（位号集合、封装名、引脚表）；
- 官方 PDF 数据手册本地提取（纯 Python 标准库，按坐标还原表格）。

完整方法论见 [`skills/eda-project-review/SKILL.md`](skills/eda-project-review/SKILL.md)。

## 安装

### 本地 link（开发调试）

```powershell
D:\plugin\link-plugin.cmd dsh-eda-review-plugin
```

等价于：

```powershell
dsh plugin --profile desktop add link:D:/plugin/dsh-eda-review-plugin
```

### GitHub 源

```powershell
dsh plugin add github:chaser-star/dsh-eda-review
```

安装后重启 DSH 生效。卸载：

```powershell
dsh plugin --profile desktop remove dsh-eda-review
```

> 若 profile 中残留旧链接（悬空符号链接），先 `remove` 或手动删除 `%USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-eda-review` 再重新链接。

## 使用

安装后技能以 `eda-project-review` 出现，在用户提供 `.epro2` / `.epru` 文件，或要求 EDA 工程审查、网表审查、原理图检查、PCB 图形检查、打样前检查、版本对比时触发。

## 安全与权限

| 项目 | 取值 |
| :--- | :--- |
| 文件写入 | 无 |
| 网络访问 | 无 |
| 子进程 / 命令执行 | 无 |
| 安装脚本（preinstall/install/postinstall/prepare） | 无 |
| 读取范围 | 仅本包内 `skills/**/SKILL.md` |
| 凭据 / 用户文件 / 环境变量 | 不访问 |
| 解析输入上限 | frontmatter ≤ 64 KiB；单个 SKILL.md ≤ 1 MiB |

依赖 `yaml` 仅用于 frontmatter 解析；当它不可解析时自动降级为内置纯文本解析器，插件不会因缺依赖崩溃。详见 [SECURITY.md](SECURITY.md)。

## 目录结构

```
dsh-eda-review-plugin/
├─ package.json
├─ index.js              # ctx.skills 技能提供者
├─ lib/frontmatter.mjs   # frontmatter 解析（yaml 优先，内置兜底）
├─ cordis.patch.yml      # bundle 补丁：insert 唯一 entry
├─ skills/eda-project-review/SKILL.md
├─ test/frontmatter.test.mjs
├─ docs/candidate-entry.json
├─ README.md  LICENSE  SECURITY.md
```

## 开发与测试

```powershell
npm test                                              # 单进程全量 77 项
node --experimental-test-coverage test/run-all.mjs    # 覆盖率
```

测试体系（三轮，见 [docs/TESTING.md](docs/TESTING.md)）：契约 11 + 安全 9 + 黄金用例 39 + 差分精度 300 例（误差 **0.00%** < 5%）+ 健壮性 15；行覆盖率 95.98%、分支 89.56%。

## 许可证

Apache-2.0，见 [LICENSE](LICENSE)。

## 市场状态

- dsh-market / dsh.so：**Declared**（作者声明），尚未 Verified；
- 上架步骤、证据门与兼容性矩阵见 [docs/MARKETPLACE.md](docs/MARKETPLACE.md)。
