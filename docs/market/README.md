# OpenFeel DSH 插件市场索引

这里是给 DeepSeek Harness「发现」页用的**官方 format 1 索引**（`index.json`），
以及它的图标。索引指向本仓库 `dsh/` 子目录的**固定 commit**，不是 npm 包。

## 当前状态（2026-11-14）

- `index.json` 随本次发版生成并提交；`npm run market:index:check` 可校验。
- **GitHub Pages 托管需仓库所有者开启**：Settings → Pages → Deploy from a branch → `master` / `/docs`。
  未开启时 `https://liuary.github.io/OpenFeel/market/index.json` 返回 404。
- 术语：`feel_mode=enabled` = **Feel Mode（流程模式）**；`disabled` = **Free Mode（自由模式）**。
- 社区市场（dsh.market / awesome-dsh-plugin / 1024Store 等）的收录方式与限制，见
  [`docs/research/dsh-plugin-market-landscape.md`](../research/dsh-plugin-market-landscape.md) 的「2026-11-14 落地状态」节。

## 这是什么渠道，不是什么渠道

| 渠道 | 本索引能否覆盖 |
|---|---|
| DSH 官方「发现」页（用户手动添加索引源 URL） | ✅ 能。这是本索引的**唯一**目标 |
| 社区市场一键安装（awesome-dsh-plugin / dshmarket / 1024Store / dshbase / DSH Community Market） | ❌ 不能。它们一律要求 npm 包身份；`source.type=git` + `path` 子目录的条目进不去 |

调研依据见 [`docs/research/dsh-plugin-market-landscape.md`](../../research/dsh-plugin-market-landscape.md)。
**这是有意接受的限制**：为了不发布独立 npm 包（适配器与 CLI 版本必须同步），我们放弃社区市场的一键安装，
只服务「愿意给 DSH 加一条索引源」的用户。

## 用户怎么用

1. 插件页 → **实验性插件** 旁的 **更多** → 打开 **自定义插件市场**；
2. **已安装** 旁的 **发现** → **添加索引源**，填入部署后的 `index.json` URL；
3. 在卡片上**安装**，确认框里会显示来源（git 仓库 + commit + 目录）。

DSH 会把该版本装成 `git+https://github.com/Liuary/OpenFeel.git#<commit>&path:/dsh`。
**前置条件不变**：用户仍需全局安装 `openfeel` CLI（`npm i -g openfeel`），适配器只是把它接进 DSH。

## 发布流程（每次发版）

```bash
# 1. 先提交：索引只能声明「某个 commit 里真实存在的版本」
git commit -am "chore: 1.5.8"

# 2. （建议）打 tag 作为人类锚点；索引记的是 commit，tag 不是必需
git tag v1.5.8

# 3. 生成/更新索引
npm run market:index

# 4. 提交生成物
git add docs/market/index.json && git commit -m "chore(market): index 1.5.8"

# 5. 部署：GitHub Pages → Settings → Pages → Source: Deploy from a branch → main / /docs
#    索引 URL 形如 https://liuary.github.io/OpenFeel/market/index.json
```

追加**旧版本**（索引会保留历史，不会丢）：

```bash
node scripts/build-market-index.mjs --commit <40位SHA> [--commit <另一个SHA>]
```

## 校验

```bash
npm run market:index:check
```

只读校验 7 项：JSON 可解析且 `format === 1`、必需字段齐全（`title` 的 LocalizedText 必须含 `en`）、
版本是合法 SemVer、commit 是 40 位小写 hex、commit 在本仓库真实存在、
**该 commit 内 `dsh/package.json` 的版本与条目版本一致**、图标文件存在。

最后一项是关键：它让「索引指向一个不含该版本的 commit」这种坏状态**无法通过校验**。

## 为什么生成器拒绝脏树

工作树可以领先于任何 commit。若读工作树里的 `version`/`engines.dsh` 去写索引，索引就会声称
「commit X 里有 1.5.8」而这个 commit 其实还是 1.5.7 —— 用户装到的是旧适配器，市场卡片却显示已安装
正确版本。所以生成器把版本、兼容范围、发布时间**全部从 commit 内读取**，并在 `dsh/` 有未提交改动时直接拒绝。

## 手动发版时别忘了

- `engines.dsh` 是索引条目的必需信息。`dsh/package.json` 缺它时生成器会拒绝 —— 
  没有范围就等于对外宣称「任意 DSH 版本可装」。
- 索引没有签名。它能被任何改得动这个静态站的人改写；HTTPS 只保证传输，不保证内容。
