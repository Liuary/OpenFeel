// stage-50 scheme_review：REV-001 关闭 + REV-002/003 追加
const fs = require('fs');
const p = '.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-50.md';
let s = fs.readFileSync(p, 'utf8');

// 1) REV-001 关闭
const st1 = s.indexOf('## REV-001:');
let end1 = s.indexOf('\n## ', st1 + 1); if (end1 < 0) end1 = undefined;
let seg1 = s.slice(st1, end1);
seg1 = seg1.replace(/- \*\*状态\*\*：pending/, '- **状态**：closed');
const th = '| 时间 | 验收人 | 结论 | 备注 |\n|------|--------|------|------|\n';
const ti = seg1.indexOf(th);
const v1 = '| 2026-09-30 00:50 | openfeel-reviewer（scheme_review 会话） | 通过，closed | op-001 §二「接口与签名变更（跨阶段契约，REV-001 / stage-51 事前约束）」完整落地：§2.1 syncCurrentOp 单一 owner 契约（deps.yaml :26 contract 字段同步登记）；§2.2 findSimilarEntries basePath 语义写死（= .openfeel/kb 绝对路径、调用时解析、删加载期 KB_BASE_DIR、stage-51 只允许传参禁另写 resolve）——比要求更细（澄清 kb 根 vs projectPath 防歧义） |';
seg1 = seg1.slice(0, ti + th.length) + v1 + '\n' + seg1.slice(ti + th.length);
s = s.slice(0, st1) + seg1 + (end1 ? s.slice(end1) : '');

// 2) 追加 REV-002/003
const revs = [
  '---',
  '',
  '## REV-002: op-003 T36 现状描述失实——「boolean 写成字符串」路径实际不可达',
  '- **状态**：pending',
  '- **优先级**：low',
  '- **提出人**：openfeel-reviewer（scheme_review 会话）',
  '- **提出时间**：2026-09-30 00:50',
  '- **blocking**：false',
  '',
  '### 问题描述',
  '',
  'op-003 :138 称 setConfigValue 现状「string 由 doc.setIn（:480）→ test_enabled 写为 \\"true\\"（字符串）」——**实测不可达**：隔离 fixture 中 `config set test_enabled true` 被命令层白名单（commands/config.ts:214，现值 `["auto_advance"]`）先行拦截（输出「无效的配置键，当前仅支持：auto_advance」、exit 1、config.yaml 未被触碰）；即便绕过白名单直接调 setConfigValue，:472 `fieldSchema.parse("true")` 对 `z.boolean()` 也会抛 ZodError，仍到不了 :480 的 setIn。',
  '',
  '**影响评估**：仅现状描述失实，修法与回归断言不受影响——且「类型归一（必须）」的判断被实测**强化**：白名单扩至 4 键后 `test_enabled` 将首次可达 setConfigValue，若不先做布尔归一将直接 ZodError 崩溃（比描述的「写坏配置」更早失败）。建议现状描述改为：「当前被命令层白名单拦截不可达；扩键后若不归一，boolean 键将 ZodError 崩溃——归一是扩白名单的前置条件」。',
  '',
  '### 处理记录',
  '',
  '| 时间 | 操作者 | 说明 | Commit |',
  '|------|--------|------|--------|',
  '',
  '### 验收记录',
  '',
  '| 时间 | 验收人 | 结论 | 备注 |',
  '|------|--------|------|------|',
  '',
  '---',
  '',
  '## REV-003: ops 本地风险编号与用户裁定编号撞名——追溯歧义',
  '- **状态**：pending',
  '- **优先级**：low',
  '- **提出人**：openfeel-reviewer（scheme_review 会话）',
  '- **提出时间**：2026-09-30 00:50',
  '- **blocking**：false',
  '',
  '### 问题描述',
  '',
  'op 文件内部风险表使用本地编号 R1~R6，与用户裁定 R1~R6 撞名且语义不同：op-002 风险表 :199「R4 = coverage 启用 CI 耗时」（本地）vs 用户裁定 R4 = 审查条目单入口；op-005 风险表 :156「R2 = T51 加锁死锁」（本地）vs 用户裁定 R2 = update_infos 保守默认；op-002 :194 的「R1」又是裁定引用。后续 REV/报告引用「R4 须确认」将产生歧义。',
  '',
  '### 建议修正',
  '',
  'ops 风险表本地编号改用「LR-」前缀或引用裁定时统一写「裁定 R4」（plan §九 已用 R-1 连字符风格，建议 ops 对齐）；机械改名，无逻辑变更。',
  '',
  '### 处理记录',
  '',
  '| 时间 | 操作者 | 说明 | Commit |',
  '|------|--------|------|--------|',
  '',
  '### 验收记录',
  '',
  '| 时间 | 验收人 | 结论 | 备注 |',
  '|------|--------|------|------|',
  '',
].join('\n');
s = s.replace(/\n*$/, '\n\n') + revs;
fs.writeFileSync(p, s, 'utf8');
console.log('REV-001 closed; REV-002/003 appended');
