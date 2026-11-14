# v1.5.20-stage-6 计划：独立发布 openfeel-dsh（方案 A，零子仓库）

> 用户确认走方案 A：单仓发布子目录包，不建镜像子仓库。目标——社区市场拿到 npm 身份，同时保持 `dsh/` 为唯一源码。

## 步骤

1. `dsh/package.json`：移除 `"private": true`（否则 npm 拒绝发布）；补 `"publishConfig": {"access":"public"}`；`files` 已含 `lib` / `cordis.patch.yml` / `README.md`，无需改。
2. CI `publish` job：在 CLI 发布之后加一步 `Publish openfeel-dsh`——比较 `dsh/package.json` 版本与 `npm view openfeel-dsh version`，不同才 `npm publish ./dsh --access public`（同一 NODE_AUTH_TOKEN）。
3. 文档：
   - README 的 DSH 适配器一节加「社区市场安装（npm）」（`dsh plugin add openfeel-dsh` + 仍需 `npm i -g openfeel` + `setup --tools dsh` + 重启）；
   - `docs/market/README.md` 渠道表：社区一键安装由 ❌ 改为 ✅（npm 包已发布）；dsh.market 仍为仓库级；
   - `docs/research/dsh-plugin-market-landscape.md`：增补「npm 身份已具备」与 awesome PR 步骤。
4. 版本收口 1.5.20：`package.json` / `package-lock.json`×2 / `dsh/package.json`（version + requiresCli）/ `dsh/ADAPTER.md` / README 最新行 / CHANGELOG / VERSIONS / skill 三副本 + templates 标记。
5. 验证：`npm publish ./dsh --dry-run`（本地）、build、tsc、vitest、lint、dsh verify/guard；重生成市场索引（指向含 1.5.20 的 commit）。
6. 归档 v1.5.20 → push → CI 验证 `openfeel@1.5.20` 与 `openfeel-dsh@1.5.20` 双发布。

## 验收

- [ ] `npm publish ./dsh --dry-run` 输出 `openfeel-dsh@1.5.20`，文件数/体积合理
- [ ] CI publish job 含 dsh 发布步且幂等（已存在同版本则跳过）
- [ ] `npm view openfeel-dsh` 在 CI 后返回 1.5.20（registry 传播延迟另计）
- [ ] 全量测试/构建/适配器用例绿；市场索引校验通过
- [ ] README 安装路径完整（npm 子包 + CLI + setup + 重启）

## 风险

- 首次发布 `openfeel-dsh` 需要 token 对新包有写权限（npm 账号级 token 应可用）。
- 两个包版本必须同步（`requiresCli` 已强制）；CI 的 `changed` 判断只针对 CLI，dsh 步自行判断版本更稳。
- 社区市场（awesome PR）仍是人工动作，本批次只做到「可被收录」。
