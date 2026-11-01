# DSH 插件市场现状调研

> **结论先行**
> 1. **没有官方集中商店/官方收录名单**。官方只提供机制：一份 format 1 的 JSON 索引放任意静态主机，DSH 默认 `indexes: []`，零内置源。
> 2. 社区侧已演化出两代：一代是「人工/自动收录的目录 + 各自的网站或 DSH 插件」（dsh.market、1024Store、dshbase、dshmarket…）；另一代是「再发布一份 format 1 索引」（唯一已确认的是 awesome-dsh-plugin → `dsh-plugin-catalog`，被 dshmarket 复用）。第二代与官方「发现」页真正互通。
> 3. **关键判断**：所有已核实社区市场的安装终点都是「npm 包身份」或「整仓 GitHub 源」；**没有一家支持 `source.type=git` + `path` 子目录条目**。因此 git 源索引条目只能进「我们自建的索引 + 官方发现页」，进不了社区市场的一键安装。
> 4. 供应链上无人签名、无人做安全审计；npm provenance 只证明「由谁构建」，不证明插件安全。dshbase 的「已验证」= 能装上并跑起来，不是安全审查。

**调研时间**：2026-11-01；本机 DSH 0.2.1-rc.5。市场数量与收录数均为各方自述，未经独立复核（标「未确认」处即未核实）。

## 全貌：两条并行路线

- **路线 A（官方机制）**：format 1 索引文件（`plugins[].versions[].source` 只有 `npm` 或 `git`+40 位 SHA）→ 用户「发现 → 添加索引源」→ 确认来源 → 常规 `dsh plugin add`。
- **路线 B（社区市场）**：自建目录数据（plugins.json / API / 仓库树）→ 自己的网站或 DSH 插件展示 → 一键安装或复制命令。多数不产出 format 1 索引，与路线 A 不互通。

## 对比表

| 市场 | 形态 | 收录来源 | 安装方式 | 主要局限/风险 |
| --- | --- | --- | --- | --- |
| 官方「发现」（自定义索引源） | DSH 内置 UI（需打开实验性组合包「自定义插件市场」）+ 静态 JSON | 任何 format 1 索引；source 可为 npm 或 git(SHA+可选 path) | 确认框显示来源后走常规安装；npm→`name@version`，git→`git+<url>.git#<commit>`（子目录追加 `&path:/<path>`） | 默认零索引源；无签名、无审核，官方明说「市场是第三方内容」；http 索引可被中间人改写 |
| 官方参考生成器 `apps/plugin-market-generator` | 仓库内工具（非市场） | 一份纯文本列表（npm 包名或 https Git 仓库 URL） | 生成索引后自行发布静态主机 | 只生成、不托管；git 版本按默认分支与 `vX.Y.Z`/`X.Y.Z`/`<name>@X.Y.Z` tag 枚举，monorepo 子包是否逐个成条未确认 |
| awesome-dsh-plugin / `dsh-plugin-catalog` | GitHub 列表 + 网站 + npm 包 + format 1 索引（jsDelivr / awesome-dsh-plugin.com / dshmarket.com 三份） | PR 到 awesome 仓库，一条一行；门槛是「能用 `dsh plugin add` 装且描述属实」，明示不排名、不审安全 | 索引里一键装（npm）；GitHub-only 条目只在列表/站点旁边给命令 | **索引只覆盖「已发 npm 且有已知版本」的插件**（README 明示）；抽样 145 条 `source` 全为 npm、0 条 git；收录数自述 8107 |
| dshmarket（dshmarket.com，`dsh-market/dsh-market`） | DSH 插件（0.2.1+ 是 Plugins 页的 Plugin Market 页签）+ 网站 | 实时读 `awesome-dsh-plugin.com/plugins.json`，本身不含目录 | 一键装：npm 优先 → 作者预构建 tarball → 整仓 GitHub 源；安全策略为「只允许 curated registry 里的源」 | 能热改 `cordis.patch.yml`、能重启宿主；安装即执行第三方代码；npm 发布走 GitHub OIDC（来源可验，插件安全性不可验） |
| DSH Market（dsh.market，`2BingLing/dsh-market`） | GitHub Pages 静态站 + DSH 侧边栏插件（`@dsh-market/plugin`） | 每日管道扫 GitHub topic（dsh-plugin 等 5 个）+ awesome 列表 + `dsh-external` 组织 + 提交 issue；按 SKILL.md/cordis 特征判定 | Web 复制命令；插件版 skill 型 `git clone`、cordis 型 `dsh plugin add`，另有 AI 代理安装 | **以仓库为单位**（不是 npm 包），monorepo 子目录只能靠 README 解析；「一键安装」实为 agent 解析 README 后执行命令；安全模式耗 token；收录数自述 17,210（早期宣传 6000+） |
| DSH 1024Store（deepseek1024.com，`imsai-sh/awesome-deepseek-harness-plugins`） | 网站（Cloudflare Workers+D1，可 fork 自部署）+ DSH 插件 `dsh1024` + 免费 API + 目录仓库 | GitHub `dsh-plugin` topic 自动收集 + PR（结构化 JSON，静态校验 `package.json`/`dsh.bundle.patch`/patch 文件存在）；自述 13,920 | 详情页命令 `dsh1024 plugin --profile web add <npm包>`；未发 npm 的仅「浏览模式」（有仓库链接、无安装命令） | **只提供 npm 安装**；`dsh1024` 包装器上报匿名安装统计（可 `DO_NOT_TRACK` 关闭）；无签名 |
| dshbase（dshbase.com，数据在 `ylwl1997/dshbase`） | 中文指南站 + 插件目录网站 + 目录插件 `dshbase-catalog`（让 agent 查目录并给命令） | 按 npm/GitHub 元数据自动收录，上架过「来源/生态/元数据」三关；另有 L1–L4 实跑标记（自述 20,020 条、7,843 已验证、10,667 待验证，截至 2026-10-16） | 卡片复制 `dsh plugin add <包>`；或让 agent 代装 | 非官方社区站（页脚自述与 DeepSeek 无关）；「已验证」≠ 安全审计；卡片主操作是 npm 命令；`dshbase-catalog` 描述写「1700+」与网站 20,020 不一致（未确认口径） |
| DSH Community Market（`anywhere-labs/dsh-desktop`） | 桌面客户端内置市场，自带 catalog provider 契约（manifestVersion 1.0.0 + `GET /v1/plugins`），**与官方 format 1 不同** | 用户自行添加的静态 manifest，或经审 adapter（内置 DSH 1024Store、dshfind） | 只接受「精确稳定 npm 版本」候选，preview 复核 registry identity/integrity/lifecycle script；git 条目只能浏览 | 无默认源、无兜底、无官方背书；安装边界明确要求 npm 身份 → **git-only 插件不可装**；仅存在于该桌面客户端 |
| dshfind（dshfind.com） | 在线目录 + API（作为受审 adapter 内置于上面的桌面市场） | 自有运营（评分/等级/官方标记均为 provider 自述）；API 匿名配额 30 次/分 | adapter 丢弃 `install.cmd`，只认结构化 npm 证据 | 来源不被 Anywhere Labs 审核或推荐；git 不可装 |
| DSH Get（dshget.com） | 可搜索 Web 目录，公开规范化快照 `bobby-sheng/dshget-data` | 未确认 | 未确认 | 未确认 |
| `dshbundles`（dshbundles.com） | npm 包 + 站点的「整合包」（按人群一次装齐一组插件） | 作者自维护的整合包清单 | 装整合包，再由它装成员插件 | **不是市场索引**，是消费端打包器；不解决「我们被收录」 |
| `dsh-hot-installer` | npm 包（DSH 插件） | — | 热装/热卸/热更 profile bundle | **不是市场**，是安装辅助工具；你线索里这一项属误归 |

补充：**`dsh-plugin-market-index` 在 npm registry 上返回 404**（未找到同名包）；最接近的实体是 `dsh-plugin-catalog`。是否为改名/未发布，未确认。

## 官方有没有集中商店

- **没有**。官方文档只有「插件市场」机制页：索引格式、校验规则、参考生成器、校验库；明写「DSH 不内置任何索引源」。
- 官方仓库里没有官方运营的目录，也没有「官方收录名单」。插件卡片上的「随 DSH 提供」指随发行版内置的组合包，不是商店收录。
- 桌面端的 DSH Community Market 属 Anywhere Labs（第三方），且它自己也声明「没有默认、优先或兜底目录来源」。

## 对我们（openfeel-dsh）的含义

现状：`openfeel-dsh` 在 monorepo 子目录 `dsh/`，`private: true`，版本 1.5.7，`repository.directory = dsh`。

**渠道 A：自建 format 1 索引（git 源）——唯一能表达「子目录 + 固定 commit」的渠道**

```json
{"name":"openfeel-dsh","title":"OpenFeel","versions":[{"version":"1.5.7","publishTimestamp":0,
 "source":{"type":"git","url":"https://github.com/Liuary/OpenFeel","commit":"<40位SHA>","path":"dsh"}}]}
```

- 能走通：官方「发现」页添加该索引 URL 即可浏览与安装，无需发 npm。
- 代价：索引放静态主机要自己运维；每个版本要手工写入新 commit（生成器虽支持 git 仓库，但版本发现按默认分支与 `vX.Y.Z`/`X.Y.Z`/`<name>@X.Y.Z` tag 枚举，monorepo 子包的 tag 约定未确认）；**社区曝光为零**——社区市场不会因为这份索引收录我们。

**渠道 B：社区市场——git+path 条目进不去任何一家的一键安装**

- awesome-dsh-plugin 的 format 1 索引 README 明示「只覆盖已发布到 npm 且有已知版本的插件」，GitHub-only 条目只出现在列表与站点上给命令；抽样 `source` 全为 npm。
- 1024Store 只给 npm 安装命令，未发 npm 的仅浏览模式；dshbase 卡片主操作是 npm 命令。
- DSH Community Market 的安装边界写死「明确且合法的 npm package 身份」，git 条目浏览可以、安装不行。
- dsh.market（2BingLing）以仓库为单位，cordis 型仍回落到 `dsh plugin add`（npm）；monorepo 子目录要靠 README 解析。

**判定**

| 想达成 | git 源索引够不够 | 是否必须发 npm 包 |
| --- | --- | --- |
| 官方「发现」页可搜可装（需用户手填索引 URL） | 够（`path: "dsh"` 精确指向子目录） | 不必 |
| 进 awesome-dsh-plugin 的 format 1 索引 / dshmarket / 1024Store / dshbase 的一键安装 | 不够 | **必须**（`private: true` 需去掉） |
| 只在社区站获得「被列出 + 给出安装命令」 | 部分可以（awesome 列表接受 GitHub-only 条目） | 不必，但拿不到一键安装与版本自动刷新 |

**建议（双轨）**：先自建 git 源索引覆盖「不想装 npm 包」的用户；若要社区渠道 + 版本自动发现，最终仍需发布独立 npm 包（在 `dsh/` 目录发布即可，`files` 已含 `lib` 与 `cordis.patch.yml`，成本低）。发布后向 awesome-dsh-plugin 提 PR 是**唯一已确认**能进 format 1 索引的路径；随后 1024Store、dshbase、dsh.market 各自走 topic/PR/issue 收录。注意被收录 ≠ 被审核，README 与详情页仍需自带供应链风险声明。

## 参考链接

- 官方：[插件市场（中文）](https://deepseek-harness.github.io/deepseek-harness/guide/plugin-market)、[Plugin market (EN)](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market)、[索引格式说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-10-02-plugin-market-index-format.zh.md)、[参考生成器](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/plugin-market-generator/README.zh.md)、[索引校验库](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/plugin-market-index/README.zh.md)
- awesome-dsh-plugin：[仓库](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)、[站点](https://awesome-dsh-plugin.com)、[format 1 索引](https://awesome-dsh-plugin.com/index.json)、[npm 包](https://www.npmjs.com/package/dsh-plugin-catalog)
- dshmarket：[仓库](https://github.com/dsh-market/dsh-market)、[站点](https://dshmarket.com)、[npm](https://www.npmjs.com/package/dshmarket)
- DSH Market（2BingLing）：[仓库](https://github.com/2BingLing/dsh-market)、[站点](https://dsh.market/)
- DSH 1024Store：[目录仓库](https://github.com/imsai-sh/awesome-deepseek-harness-plugins)、[站点](https://deepseek1024.com/)、[站点/CLI 源码](https://github.com/imsai-sh/dsh-1024store)
- dshbase：[插件页](https://dshbase.com/zh/plugins/)、[插件目录](https://dshbase.com/zh/plugins/directory/)、[审计方法](https://dshbase.com/zh/audit/)、[数据集](https://github.com/ylwl1997/dshbase)、[npm](https://www.npmjs.com/package/dshbase-catalog)
- DSH Community Market：[provider 契约](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-community-market/docs/catalog-provider-contract.zh.md)、[adapter 指南](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-community-market/docs/catalog-adapter-guide.zh.md)、[market-shell](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-community-market/docs/market-shell.zh.md)
- 其他：[dshfind](https://dshfind.com)、[DSH Get](https://www.dshget.com/)、[dshget-data](https://github.com/bobby-sheng/dshget-data)、[dshbundles](https://dshbundles.com)、[dsh-hot-installer](https://github.com/KYinCode/dsh-hot-installer)
