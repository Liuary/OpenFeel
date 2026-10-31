# v1.5.1-stage-109 计划 — package-lock 误替换热修

- **阶段**：`v1.5.1-stage-109`（fast 热修；REQ-010）
- **故障**：v1.5.0 发版时用全局 `1.4.0 → 1.5.0` 替换 `package-lock.json`，误改 `natural-compare`（真实最新 1.4.0）为不存在的 `1.5.0`；CI `npm ci` 报 `ETARGET No matching version found for natural-compare@1.5.0`，publish 未执行。
- **修复**：仅回改三处：`natural-compare` 依赖范围 `^1.5.0 → ^1.4.0`（两处）+ `node_modules/natural-compare.version 1.5.0 → 1.4.0`；其余 `1.5.0`（package 自身版本、`@jridgewell/sourcemap-codec ^1.5.0`、`esquery ^1.5.0`）保持不变。
- **验证**：`npm ci` 成功 → `npm test` 全绿 → `npm run build` → `--version` 1.5.1 → push → CI publish 成功。
- **边界**：不改任何代码逻辑；1.5.0 的功能内容原样保留，仅修复安装锁。
