# v1.5.22-stage-9 计划：CI 切 OIDC 可信发布

## 背景
`openfeel` 与 `openfeel-dsh` 都已通过 `npm trust github` 配好 Trusted Publisher（file ci.yml / repo Liuary/OpenFeel）。
但 CI 仍在用 `NODE_AUTH_TOKEN`（新 token 需要 2FA，导致 1.5.21 发布 EOTP 失败）。

## 步骤
1. `.github/workflows/ci.yml` 的 publish job 加：
   ```yaml
   permissions:
     contents: read
     id-token: write
   ```
2. 移除 job 级 `env: NODE_AUTH_TOKEN`（OIDC 优先，不再依赖密钥）。
3. push 触发 CI：两个包应通过 OIDC 发布 `1.5.21`。
4. 验证：`npm view openfeel version` / `npm view openfeel-dsh version`，以及 npm 页面 README 是否为新的通俗版。
5. 收口 REQ-038 / 阶段（不升版本，1.5.21 已收口）。

## 验收
- [ ] CI publish job 无 token 也能发布两个包
- [ ] `openfeel@1.5.21`、`openfeel-dsh@1.5.21` 上 npm
- [ ] npm 页面展示新 README；Pages 索引已含 1.5.21（已确认）
