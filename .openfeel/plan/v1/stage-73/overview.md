# v1.1.6-stage-73

## 目标

> Claude 全局 `~/.claude/settings.json` 注入（一等能力）：`openfeel setup/update --tools claude` 部署时**严格 JSON 读-深合并-写回**，注入 `agent:"feel"`（裁定 G）+ `permissions.defaultMode:"auto"`（裁定 F，automod=auto mode），**逐字保留用户既有键**（`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 等）；二次运行字节幂等（无变化 → skipped）；备份/卸载语义就绪。**反转蓝本 §四原「不写 settings.json」裁定。**

## 依赖

- v1.1.6-stage-69（hard）
- v1.1.6-stage-71（hard）

## 操作方案

- `ops/op-001.md` — `claude-settings.ts`（严格 JSON 深合并 + `applyClaudeSettings` 单一共享函数）+ 单测（T1 + T6.1~T6.4 + D-SET/D-SET2/D-SET3）
- `ops/op-002.md` — `setup/update` 接线 + 备份/anomaly + i18n（768→774）+ 集成测（T2 + T3 + T5 + T6.5~T6.8）
- `ops/op-003.md` — 卸载/回滚语义文档（Q6）+ auto mode 实测（R-11）+ 全门禁 + 报告（T4 + T7 + T8）
- `ops/deps.yaml` — op 依赖声明（hard 链：op-001 → op-002 → op-003）

**执行顺序：op-001 → op-002 → op-003。**
