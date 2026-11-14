# v1.5.21-stage-7 计划：暴露 openfeel-dsh 发布失败原因

## 背景
CI #115/#116 的 `Publish openfeel-dsh` 步在 1 秒内失败；GitHub 日志需 admin 权限，本地无法读取。
失败注解里只有 exit 1，没有 npm 的错误文本。

## 步骤
1. 在 `ci.yml` 的 dsh 发布步用 `tee` 捕获 npm 输出；失败时把 `stderr` 摘要（去换行、截断 600 字符）
   以 `::error::openfeel-dsh publish failed (exit N): ...` 写入注解。
2. 推送触发 CI（CLI 已是最新 → 只跑 dsh 发布）。
3. 通过公开的 check-run annotations API 读取错误文本，判定是 token 权限（403/E401）、2FA（EOTP）
   还是打包/命令问题，再决定修复。
4. 收口需求与阶段（不升版本，纯 CI 诊断）。

## 验收
- [ ] 注解里能看到 npm 的真实错误摘要
- [ ] 能据此给出唯一的修复动作
