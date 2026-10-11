# v1.1.7-stage-75 状态

- **执行模式**：auto
- **自动推进**：enabled
- **状态**：planned
- **当前责任 Agent**：user
- **上一责任 Agent**：none
- **更新时间**：2026-10-11 08:06

## Worktree / Session

- **工作模式**：manual
- **分支名**：-
- **Session 名称**：-
- **合并状态**：not_started
- **清理策略**：manual

## 当前任务

- [ ] 任务1：plan stage add --workflow-mode（仿 --exec-mode：值域 getConfigFieldLegalValues 派生、非法 exit 1 且不建阶段）+ StageSkeletonOverrides 扩键 + ensureStageSkeleton 骨架增「工作流模式」行（置于「自动推进」之后）
- [ ] 任务2：stage set <stageId> --workflow-mode（单阶段覆盖/切回 full；缺失字段插入语义，裁定 H；.bak 备份 + 同值 no-op）
- [ ] 任务3：flow mode [--stage <id>] [--json] 新增只读命令（当前模式 + 来源；复用 resolveEffectiveConfig 来源枚举；不写盘不推进）
- [ ] 任务4：wizard 首次选型：TTY 询问并将选择写入 status.md + config.yaml defaults（项目级记忆，裁定 A）；非 TTY 落默认 fast 不阻塞
- [ ] 任务5：config set defaults.workflow_mode --sync-stages 支持（含缺失字段插入，裁定 H）+ flow.json stages.{id}.workflow_mode 可选冗余写入（不参与级联，裁定 G）
- [ ] 任务6：op 骨架机械铺入口（裁定 I：全量骨架由 CLI 铺，不新增 Agent；提供显式选项，不做隐式副作用）
- [ ] 任务7：i18n 新键双表成对 + 新基线显式登记
- [ ] 任务8：测试：选项/命令/交互/记忆/插入语义全绿（status.md 逐字保留 + SHA256 不写盘断言）+ 门禁

## 阻塞 / 暂停原因

无

## 状态记录

| 时间 | Agent | 状态变化 | 说明 |
|------|-------|----------|------|
| 2026-10-11 08:06 | user | planned | 阶段已创建 |
