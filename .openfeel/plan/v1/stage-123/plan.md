# stage-123 计划：DSH 适配器发布面（REQ-026）

> 模式 fast ｜ 需求 REQ-026 ｜ 目标：让 `openfeel-dsh` 在 DSH 侧「可发现、可安装、兼容性可校验」，且**不发布独立 npm 包**。

## 一、背景与决策依据（已核实）

| 事实 | 出处 |
|---|---|
| DSH 插件分发单位 = npm bundle（`dsh.bundle.patch`），装进 profile 并追加 `dsh.profile.bundles` | 官方 publish 文档 |
| 市场 = 一份 format 1 JSON 索引，放任意静态主机；DSH 默认 `indexes: []`，无内置源 | 官方 guide/plugin-market |
| 索引版本 source 仅两种：`{type:"npm"}` 或 `{type:"git", url, commit(40hex), path?}` | 同上 |
| `engines.dsh` 一旦声明，**只由它决定**，忽略 `peerDependencies`；两者都无 = 不施加版本约束 | `@deepseek-ai/dsh-app-boot` README |
| 组合包（bundle）版本不兼容 → **被跳过并记入 `skippedBundles`**，不中断启动 | 同上 |
| 当前 `dsh/package.json`：`private: true`、无 `engines.dsh`、无 dsh peer 依赖 | 本机核对 |
| 适配器 `dsh/lib/**` 只 import Node 内建模块，零 `@deepseek-ai/*` 依赖 → 没有 peer 可退，`engines.dsh` 是**唯一**兼容信号 | 本机 grep |
| `src/` 从不读 `engines` → 补 `engines.dsh` 不影响 `setup --tools dsh` 部署链路 | 本机 grep |
| `engines: { node, dsh }` 并列合法；SemVer 范围或精确预发布版均可 | `dsh-package-manifest` README |
| 仓库无任何 tag；HEAD `b9b794c6` | 本机 `git tag -l` |
| **调研确证**：无一家社区市场支持 `source.type=git` + `path` 子目录；安装终点只有 npm 包身份或整仓 GitHub 源 | `docs/research/dsh-plugin-market-landscape.md` |

**决策 1（用户已定）**：`engines.dsh` 取宽松范围 `">=0.2.0"`，不设上界。
理由：bundle 不兼容是「跳过加载」而非启动失败，但设上界会在 DSH 0.3 发布时让老用户适配器静默失效；宽松范围内适配器自身的能力探测（`ctx.tools.guard` 缺失降级）已有兜底。

**决策 2（用户已定）**：走 C 路线（git 源索引），不发布独立 npm 包。
代价：`dsh plugin add` 需给 git spec；市场条目指向整仓 + `path:"dsh"`。

**决策 3（本计划新增）**：索引必须**可重建且不可撒谎**——commit 必须真的含有该版本的 `dsh/`。
理由：git 源索引把「版本 → commit」写死在 JSON 里，一旦指向的 commit 不含该版本改动，用户装到的是旧的/坏的适配器，且市场卡片显示「已安装」。因此生成器在 `dsh/` 有未提交改动时**拒绝生成**（exit 1），而不是只警告。

## 二、改动清单

| # | 文件 | 动作 |
|---|---|---|
| 1 | `dsh/package.json` | `engines` 增加 `"dsh": ">=0.2.0"` |
| 2 | `scripts/build-market-index.mjs` | 新增：git 源索引生成器 + 自校验 + `--check` |
| 3 | `docs/market/index.json` | 生成物：format 1 索引（openfeel-dsh，版本 → HEAD commit） |
| 4 | `docs/market/icons/openfeel.svg` | 新增：插件图标（相对路径引用） |
| 5 | `docs/market/README.md` | 新增：如何发布/更新索引（含 GitHub Pages 指向 `/docs` 的说明） |
| 6 | `package.json` | 新增 script：`"market:index": "node scripts/build-market-index.mjs"` |
| 7 | `docs/research/dsh-plugin-market-landscape.md` | 子 agent 产出的市场生态调研 |
| 8 | `dsh/README.md` | 安装一节补「方式 C：官方发现页 / git 源」，并写明 C 的渠道上限 |

## 三、生成器契约

```
node scripts/build-market-index.mjs [--out <path>] [--commit <sha> ...] [--check] [--allow-dirty]
```

- 版本与包名：读 `dsh/package.json`（`name` / `version` / `description` / `engines.dsh` / `openfeel.requiresCli`）。
- 默认 `--commit` = `git rev-parse HEAD`；`publishTimestamp` = `git show -s --format=%ct <sha>`。
- **拒绝条件 1（脏树）**：`git status --porcelain -- dsh/` 非空 → exit 1，提示先提交（`--allow-dirty` 可绕过，仅供本地预览，且输出显式 STALE 警告）。
- **拒绝条件 2（自审补）**：`dsh/package.json` 缺 `engines.dsh` → exit 1。索引条目必须携带 `engines.dsh` 且与包自身一致；缺失时索引等于宣称「任意 DSH 版本可装」。这条让「先补 engines.dsh」成为生成的前置条件，防止顺序颠倒。
- 结构：`{ format: 1, title: {en, zh}, description, plugins: [ { name, title, description, icon, author, homepage, repository: {url, directory}, versions: [...] } ] }`。
- `versions[]`：`{ version, publishTimestamp, source: { type:"git", url, commit, path:"dsh" }, engines: { dsh } }`。
- **保留历史**：读取已有 `--out`，按 version 合并去重（新条目覆盖同名版本），避免每次发布丢旧版本。
- `--check`：只读，校验①JSON 可被 parse 且 `format===1` ②必需字段齐全 ③`version` 为合法 SemVer ④`commit` 为 40 位小写 hex ⑤`git cat-file -e <commit>` 存在 ⑥`git show <commit>:dsh/package.json` 的 version 与该条目一致 ⑦图标文件存在。任一失败 exit 1。
  - ⑤⑥ 的 git 调用失败必须**捕获并以「commit 不存在 / 无法读取该 commit 的 dsh/package.json」汇报**，不得把 git 原始 stderr 抛给用户（自审补）。

## 四、验收

1. `node scripts/build-market-index.mjs` 在**干净树**下成功，`docs/market/index.json` 结构合法。
2. 在 `dsh/` 有改动时（当前正是这种情况）**拒绝生成**，exit 1 且零写盘。
3. `node scripts/build-market-index.mjs --check` 对恶意/过期索引能报出具体违规项（用临时副本验证：篡改 commit → 报错；篡改 version → 报错）。
4. `dsh/package.json` 带 `engines.dsh: ">=0.2.0"` 后，`openfeel setup --tools dsh` 部署链路不受影响（结构校验读的是 dependencies/bundles，不读 engines）。
5. `npm test`（vitest）与 `dsh` 的 contract/verify 不受影响（未触碰适配器代码）。
6. 调研文档成文，且明确回答「git 源能否被社区市场收录」。

## 五、不做什么（边界）

- 不发布独立 npm 包，不改 `private`。
- 不提交 git commit（是否提交与打 tag 由用户决定）；因此本次生成物会**停留在一个不含该改动的 HEAD 上**——计划把这一点作为已知状态显式报告，并在 `docs/market/README.md` 写明「发布前必须在提交后重跑」。
- 不改适配器 `lib/`、不改 `cordis.patch.yml`、不动 `openfeel setup` 的 `link:` 机制。
- 不启用 DSH 实验性市场组合包、不改 `~/.dsh` 下任何配置。

## 六、风险

| 风险 | 处置 |
|---|---|
| **C 路线的最达上限已确证有限**：git 源索引只能进「我们自建索引 + 官方发现页」，社区市场（awesome-dsh-plugin / dshmarket / 1024Store / dshbase / DSH Community Market）一律要求 npm 包身份 | 本次仍按用户决定交付 C；在 README 与最终汇报中**显式写明**这一上限，并把「发独立 npm 包 + 向 awesome 提 PR」登记为后续可选路径，不擅自实施 |
| git 源安装需要 `path:"dsh"` 支持 | 官方指南 monorepo 示例即此形态（`&path:/<path>` 追加在 git spec 上）；DSH 原生支持 |
| 索引 commit 与版本漂移 | 生成器拒绝脏树 + `--check` 第 ⑥ 项（`git show <commit>:dsh/package.json` 版本必须一致） |
| 无 tag 导致「发布」缺少锚点 | README 建议发版打 `v<version>` tag 后再生成；索引仍记 commit（tag 只是人类锚点） |

## 七、计划审查记录（self-review）

**审查方式**：`self-review`（Feel 自审）。
**原因**：原派发的独立审查 agent（6baf1bd1）超时未返回，已中断；为不阻塞流水线，按纪律由 Feel 自审并在标题标注 `self-review`，归档摘要记录此因。

**自审查出并已修入本计划的 3 项**：

1. 生成器缺「`engines.dsh` 必须存在」的前置拒绝 —— 否则可出现「包没有范围、索引也没有范围」的静默漏洞（已加拒绝条件 2）。
2. `--check` 在 commit 不存在时会把 git 原始 stderr 抛出，不可读 —— 已要求捕获并给结构化汇报。
3. 变更清单漏了 `dsh/README.md`（安装一节需补「方式 C」与渠道上限说明）—— 已加为第 8 项。

**自审确认无问题的项**：
- 索引 JSON 结构与 format 1 对齐：`title` 为 LocalizedText 且含 `en`；`publishTimestamp` 用 `%ct`（Unix 秒）；`repository.directory = "dsh"` 与包在仓内的位置一致；`name` 用包名 `openfeel-dsh`（git monorepo 条目同样用包名，官方示例即此）。
- 脏树判据覆盖未跟踪文件（`porcelain` 含 `??`），不会漏「新文件尚未入库」的情形。
- 副作用：根 `files` 是白名单（`dist/bin/schemas/dsh/*`），`scripts/` 与 `docs/` 不会进入 npm 包。
- 验收第 4 条已提前实测：`src/` 全文无 `engines` 引用，部署链路不受影响。
- 不在 CI 挂 `--check`：仓库尚无 release tag，HEAD 一动索引即 stale，会造成常态红灯；登记为后续项。

## 八、代码审查记录（self-review）

**方式**：`self-review`（与 §七 同因：独立审查 agent 已中断，为避免再次超时阻塞，由 Feel 自审并标注）。

**自审查出并已修（2 项，均为真缺陷）**：

1. **合并历史时按 `plugins[0]` 取版本** —— 索引将来若加入第二个插件条目，会静默丢掉我们的历史版本。
   已改为按包名 `openfeel-dsh` 定位。
2. **脏树拒绝提示自相矛盾** —— 原提示建议「用 `--out` 指到临时路径预览」，但图标校验要求图标与索引同目录，
   照做必然失败。已改为「在独立工作副本里提交后再跑」。

**执行期发现并已修（2 项）**：

3. **无根 `package.json` 时崩溃** —— 生成器无条件读仓库根清单；已在临时仓库测试中暴露，改为可缺省。
4. **子进程管道捕获 `spawn EPERM`** —— 受限环境（本机 DSH 沙箱、禁命名管道的 CI）下 `execFileSync` 管道直接失败；
   已加降级路径：首次 EPERM 即永久切换为「重定向到临时文件再读回」，两条路径结果一致。

**实测（见 §四）**：脏树拒绝且零写盘；干净仓库生成并通过自校验；5 个负例（不存在 commit / 版本不一致 /
缺 `engines.dsh` / 范围不一致 / 图标缺失 / 索引不存在）全部被拦；多版本显式追加与 HEAD 增量合并均保留历史。

**未能验证**：`npm test`（vitest）在本机沙箱下于 esbuild `spawn EPERM` 处启动失败，与本改动无关（错误发生在
加载配置阶段，早于任何测试）；本次未运行根测试套件。
