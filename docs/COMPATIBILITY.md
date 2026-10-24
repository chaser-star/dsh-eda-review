# COMPATIBILITY — DSH 版本兼容性

目标：在**较旧版本的 DSH 运行时**上也能安全加载；宿主缺少所需扩展点时优雅降级，而不是让 Profile 启动失败。

## 结论

所需扩展点（`ctx.skills.registerProvider` + 相同 provider 字段）在 **0.0.1-rc.5（最早发布版本）到 0.2.1-rc.3（当前）** 的全部已发布版本中均存在，provider 字段处理在 0.1.0-rc.2 与 0.1.5-rc.3 中逐项一致。运行时实测覆盖 0.2.1-rc.3；其余版本为包级代码检查证据。

| DSH 版本 | 安装 | 配置组装 | 模块加载 / 技能注册 | 证据类型 |
| :--- | :--- | :--- | :--- | :--- |
| `0.2.1-rc.3` | ✅ link 安装到一次性 Profile | ✅ `--dump-config` 出现 `dsh-eda-review` 条目 | ✅ `list()` 返回 `eda-project-review`、`get()` 返回 23,891 字节技能内容；**`yaml` 缺失仍正常** | 真实安装实测 |
| `0.1.5-rc.3` | — | ✅ 旧 CLI 支持 `dsh.bundle.patch` | ✅ `dsh-skill` 暴露 `registerProvider(create)`；`rank/source/resourceBase/invocation/locator/metadata` 均有处理 | 包级代码检查 |
| `0.1.2-rc.1` | — | — | ✅ `registerProvider` 存在 | 包级代码检查 |
| `0.1.0-rc.2` | — | — | ✅ `registerProvider` 存在；六项 provider 字段处理计数与 0.1.5-rc.3 完全一致 | 包级代码检查 |
| `0.0.1-rc.5`（最早发布） | — | — | ✅ `registerProvider` 存在 | 包级代码检查 |

真实安装实测命令与输出见 `docs/TESTING.md` 与本节末尾的复现步骤。

## 插件使用的宿主契约

1. **服务注入**：`inject = ['skills']` —— 宿主没有 `skills` 服务时插件不会加载，属正常降级；
2. **注册入口**：`ctx.skills.registerProvider(create)` → `create()` 返回 `{ name, list(options), get(candidate, options) }`；
3. **provider 返回字段**：`name`、`description`、`invocation`、`provider`、`source`、`resourceBase`、`rank`、`locator`、`path`、`metadata`、`content`；
4. **清单契约**：`package.json` 的 `dsh.bundle.patch` → 包内 `cordis.patch.yml`（`insert` 唯一 entry `dsh-eda-review`）；
5. **无额外依赖**：不调用 Loader/Fiber、不写文件、不联网；frontmatter 解析优先 `yaml`，不可解析时使用内置纯文本解析器。

## 降级行为

| 宿主情况 | 插件行为 |
| :--- | :--- |
| 无 `skills` 服务 | Cordis 因 `inject` 不加载本插件 |
| 有 `skills` 但无 `registerProvider` | 保持惰性：不抛错、不改宿主状态；若 `ctx.logger.warn` 可用则输出一条说明 |
| `yaml` 依赖缺失 | 自动使用内置解析器（已验证：0.2.1-rc.3 一次性 Profile 中 `yaml` 未安装仍成功注册技能） |
| 任意版本 | `list()/get()` 支持 `AbortSignal`；输入大小有上限（frontmatter 64 KiB / 单文件 1 MiB） |

## 在你使用的版本上复测

```powershell
$env:DSH_HOME='D:\DSH\_compat-home'
dsh plugin --profile compat add link:D:/plugin/dsh-eda-review-plugin
dsh --profile compat --dump-config | Select-String dsh-eda-review
node D:\DSH\compat-smoke.mjs
```

期望：`--dump-config` 输出 `- id: dsh-eda-review`；冒烟脚本打印 `listed skills: ["eda-project-review"]`。

## 尚未验证

- 完整会话运行（`dsh headless` / Web UI 内技能列表显示）需要模型凭据与真实 Profile，属 E4，未执行；
- `0.1.5-rc.3` 及更早版本的**运行时**加载（当前仅有包级代码检查证据）；
- 旧版本客户端 UI 中的技能卡片渲染（本插件不提供 Client UI，风险低）。

## 版本策略

- 不锁定 DSH 版本：插件只依赖上述稳定契约，新增字段均为向后兼容的附加字段；
- 若未来 DSH 调整 `skills` 服务签名：优先在 `apply` 内做特性检测与适配，保持旧版本可用，其次才提升最低版本；
- 兼容性结论随实测更新本文件，不以「曾经能跑」推断当前版本。
