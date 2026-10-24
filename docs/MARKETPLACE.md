# MARKETPLACE — 上架清单与证据门

目标市场：`dsh-market`（本机安装的 `dshmarket@1.66.47`，MIT）及其配套提交站 <https://www.dsh.so/zh/submit/>。

## 收录硬条件（dsh.so 接受标准）

| 条件 | 本工程状态 |
| :--- | :--- |
| `dsh` 字段（DSH 兼容信号） | ✅ `dsh.bundle.patch` |
| README 带安装说明 | ✅ README.md「安装」节 |
| 开源许可证（SPDX 可识别） | ✅ Apache-2.0（LICENSE + package.json） |
| 插件 id 匹配 `^[a-z0-9]+(-[a-z0-9]+)*$` | ✅ 仓库名/包名 `dsh-eda-review` |
| 可被安全扫描的源码 | ✅ `index.js` + `lib/frontmatter.mjs` |
| 安全扫描无阻断级发现 | ⏳ 提交后由 dsh.so 执行 |
| 无安装期脚本 | ✅ preinstall/install/postinstall/prepare 均不存在 |

## 状态（诚实区分）

| 状态 | 取值 | 说明 |
| :--- | :--- | :--- |
| 本地审计 | 静态 80/80（isolated-acceptance-ready），0 blockers | `audit-plugin.mjs` 2026-10-25 |
| 测试轮次 | 3 轮：功能 59 → 差分 300 → 回归 77×3 | 见 [TESTING.md](TESTING.md) |
| 单元/集成测试 | 77 项：76 通过 / 0 失败 / 1 跳过（yaml 差分） | `node test/run-all.mjs` |
| 差分精度 | 300 例 / 0 失配 / 误差 0.00%（门限 <5%） | `node test/differential.test.mjs` |
| 覆盖率 | 行 95.98% / 分支 89.56% / 函数 98.54% | `node --experimental-test-coverage test/run-all.mjs` |
| 运行时验收（E3） | 未验证 | 需一次性 Profile 安装 + dump-config + 启动冒烟 |
| 市场收录 | **Declared**（作者声明） | 未被 dsh.so 独立验证为 Verified |
| 版本兼容矩阵 | `unknown` | 未在具体 DSH 版本上实测 |

## 四个独立 assurance 层

| 层 | 当前 | 需要的证据 |
| :--- | :--- | :--- |
| discovery（发现） | ✅ 本地 candidate 记录 | `docs/candidate-entry.json` |
| installability（可安装） | ⏳ unknown | 一次性 Profile `dsh plugin add` 成功 + dump-config |
| runtime（运行时） | ⏳ unknown | 技能出现在列表并可被调用 |
| securityReview（安全复核） | ⏳ unknown | 提交后平台扫描报告（automated-scan） |

## 上架步骤

1. 推送仓库并打 `dsh-plugin` 话题；
2. 打开 <https://www.dsh.so/zh/submit/> 粘贴仓库 URL → 自动拉取/校验/扫描；
3. 扫描无阻断项后提交条目 → 维护者审核合入；
4. 收录后为 Declared；要升至 Verified 需提交真实兼容性实测报告（官方 Discussions 模板）。

## 与 DSH STORE（registry 型市场）的差异

dsh.so / dshmarket 走「提交 → 平台扫描 → 审核收录」；DSH STORE 的 catalog 则要求固定 Commit、四层 assurance 与 `validate:registry` CI。本工程的 bundle 结构同时满足两者：`dsh.bundle.patch`、唯一 entry id、package-relative patch、license/repository 齐备。
