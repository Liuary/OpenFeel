/**
 * OpenFeel × DSH — 写入门禁测试
 *
 * 纯 Node 运行：`node dsh/test/guard.js`
 * 只使用临时目录与 fake ToolExecution，不接触真实 DSH 运行时。
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { classifyShellCommand, clearGuardCache, createOpenFeelGuard, isPresentationalAssetPath, normalizeForComparison, parsePatchTargets, resolveGuardCwd } from '../lib/guard.js';
import { touchSession } from '../lib/adapters/sessions.js';
import {
  CWD_REGISTRY_LIMIT,
  cwdRegistrySize,
  getSessionCwd,
  resetCwdRegistry,
  touchSession as touchCwdSession,
} from '../lib/adapters/session-cwd-registry.js';
import * as cwdRegistryModule from '../lib/adapters/session-cwd-registry.js';
import {
  buildGuardSection,
  clearGuardState,
  computeGuardStale,
  globalGuardAuditPath,
  globalGuardDir,
  globalGuardStatePath,
  guardAuditPath,
  guardStatePath,
  maybeSelfHealGuardState,
  readGuardSelfHealStats,
  readGuardState,
  repairGuardState,
  resetGuardSelfHealState,
  setGuardRuntimeIdentity,
  writeGuardState,
} from '../lib/adapters/guard-state.js';
import { defaultMarkerPath } from '../lib/adapters/host-state.js';
import { computeWorkflowGate } from '../lib/adapters/workflow-gate.js';
import { renderBootstrapPrompt, renderFeelPrompt } from '../lib/surface/prompt.js';
import { assertRealGuardUntouched, installIsolatedGuardEnv, snapshotRealGuardState } from './guard-isolation.js';

// v1.5.12 / stage-127 §3-B：先把 guard 状态与宿主 marker 指到临时目录（绝不改写真实状态），
// 再记录真实状态快照供收尾断言（V4）。
const iso = installIsolatedGuardEnv();
const realGuardBefore = snapshotRealGuardState();

const root = mkdtempSync(join(tmpdir(), 'openfeel-guard-'));
// 测试隔离：cwd 链第 0 环（OPENFEEL_GUARD_CWD）与 shell 档位都读环境变量，
// 不清掉本机配置就会串进所有用例（需要时由 withGuardEnv / guardWithShellGate 临时设置）。
delete process.env.OPENFEEL_GUARD_CWD;
delete process.env.OPENFEEL_SHELL_GATE;
let passed = 0;
let failed = 0;

/** @param {string} label @param {() => void} fn */
function check(label, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  ok  ${label}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`  FAIL ${label}\n       ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/** @param {string} name */
function workspace(name) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** @param {string} name @param {any} flow */
function project(name, flow) {
  const dir = workspace(name);
  mkdirSync(join(dir, '.openfeel'), { recursive: true });
  writeFileSync(join(dir, '.openfeel', 'flow.json'), JSON.stringify(flow, null, 2), 'utf8');
  return dir;
}

/** @param {string} name @param {string} cwd @param {any} [args] */
function execution(name, cwd, args = {}) {
  return { name, arguments: args, agent: { session: { header: { cwd } } } };
}

const always = createOpenFeelGuard({ enforce: 'always', language: 'zh-CN' });
const projectOnly = createOpenFeelGuard({ enforce: 'project', language: 'zh-CN' });
const off = createOpenFeelGuard({ enforce: 'off', language: 'zh-CN' });

const planFlow = { stages: { 'v1-stage-1': { phase: 'plan_review' } }, requirements: [] };
const execFlow = { stages: { 'v1-stage-1': { phase: 'exec_running' } }, requirements: [] };
const noStageFlow = { stages: { 'v1-stage-1': { phase: 'done' } }, requirements: [] };
const generalFlow = {
  stages: { 'v1-stage-1': { phase: 'done' } },
  requirements: [{ id: 'REQ-1', status: 'in_progress', workflow_mode: 'general' }],
};
const multiFlow = {
  stages: { 'v1-stage-1': { phase: 'plan_review' }, 'v1-stage-2': { phase: 'exec_running' } },
  requirements: [],
};

process.stdout.write('\nOpenFeel × DSH 写入门禁测试\n');
process.stdout.write('='.repeat(60) + '\n\n');

clearGuardCache();

check('off：源码放行', () => {
  assert.equal(off(execution('edit', workspace('off-src'), { path: 'src/foo.cs' })), undefined);
});

check('off：flow.json/status.md 也放行（B10）', () => {
  const cwd = project('off-flow', planFlow);
  assert.equal(off(execution('edit', cwd, { path: '.openfeel/flow.json' })), undefined);
  assert.equal(off(execution('write', cwd, { path: '.openfeel/plan/v1/stage-1/status.md' })), undefined);
});

check('always + 无 .openfeel：已存在源码拒绝', () => {
  const cwd = workspace('always-src');
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'foo.cs'), 'x', 'utf8');
  const reason = always(execution('edit', cwd, { path: 'src/foo.cs' }));
  assert.match(String(reason), /尚未初始化|not OpenFeel-initialized/);
});

check('always + 无 .openfeel：新增 docs 放行（P0-1 bootstrap）', () => {
  const reason = always(execution('write', workspace('always-doc'), { path: 'docs/design.md' }));
  assert.equal(reason, undefined);
});

check('always + 无 .openfeel：.openfeel/plan 拒绝（B8）', () => {
  const reason = always(execution('write', workspace('always-internal'), { path: '.openfeel/plan/x.md' }));
  assert.equal(typeof reason, 'string');
});

check('project + 无 .openfeel：源码放行', () => {
  assert.equal(projectOnly(execution('edit', workspace('project-src'), { path: 'src/foo.cs' })), undefined);
});

check('project + 无 .openfeel：.openfeel/plan 放行（N4）', () => {
  assert.equal(projectOnly(execution('write', workspace('project-internal'), { path: '.openfeel/plan/x.md' })), undefined);
});

check('project + 无 .openfeel：flow.json 受保护拒绝', () => {
  const reason = projectOnly(execution('write', workspace('project-flow'), { path: '.openfeel/flow.json' }));
  assert.equal(typeof reason, 'string');
});

check('plan_review：源码拒绝，消息含 phase', () => {
  const cwd = project('plan-src', planFlow);
  const reason = projectOnly(execution('edit', cwd, { path: 'src/foo.cs' }));
  assert.equal(typeof reason, 'string');
  assert.match(String(reason), /plan_review/);
});

check('guard 启用时 status.md 始终拒绝', () => {
  const cwd = project('status-enabled', planFlow);
  assert.equal(typeof projectOnly(execution('write', cwd, { path: '.openfeel/plan/v1/stage-1/status.md' })), 'string');
});

check('plan_review：.openfeel/plan 放行（B1）', () => {
  const cwd = project('plan-internal', planFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: '.openfeel/plan/v1/stage-1/plan.md' })), undefined);
});

check('exec_running：源码放行', () => {
  const cwd = project('exec-src', execFlow);
  assert.equal(projectOnly(execution('edit', cwd, { path: 'src/foo.cs' })), undefined);
});

check('无活跃阶段：源码拒绝', () => {
  const cwd = project('no-stage', noStageFlow);
  assert.equal(typeof projectOnly(execution('edit', cwd, { path: 'src/foo.cs' })), 'string');
});

check('general 需求 in_progress：无阶段放行', () => {
  const cwd = project('general-allow', generalFlow);
  assert.equal(projectOnly(execution('edit', cwd, { path: 'src/foo.cs' })), undefined);
});

check('allowGeneral=false：general 需求也拒绝', () => {
  const cwd = project('general-deny', generalFlow);
  const strict = createOpenFeelGuard({ enforce: 'project', language: 'zh-CN', allowGeneral: false });
  assert.equal(typeof strict(execution('edit', cwd, { path: 'src/foo.cs' })), 'string');
});

check('flow.json 损坏：拒绝', () => {
  const cwd = workspace('corrupt');
  mkdirSync(join(cwd, '.openfeel'), { recursive: true });
  writeFileSync(join(cwd, '.openfeel', 'flow.json'), '{broken', 'utf8');
  assert.equal(typeof projectOnly(execution('edit', cwd, { path: 'src/foo.cs' })), 'string');
});

check('多活跃阶段：任一 exec_running 放行', () => {
  const cwd = project('multi', multiFlow);
  assert.equal(projectOnly(execution('edit', cwd, { path: 'src/foo.cs' })), undefined);
});

check('非 mutating 工具放行（feel_status/read/todo_write）', () => {
  const cwd = project('non-mutating', planFlow);
  for (const name of ['feel_status', 'read', 'todo_write', 'grep', 'glob']) {
    assert.equal(projectOnly(execution(name, cwd, {})), undefined, name);
  }
});

check('v1.5.11：shell 工具缺 command 文本 → 拒绝（fail-closed，不再是免检入口）', () => {
  const cwd = project('shell-no-command', planFlow);
  const reason = projectOnly(execution('pwsh', cwd, {}));
  assert.equal(typeof reason, 'string');
  assert.match(String(reason), /command/);
});

check('apply_patch：全部目标在 .openfeel 内放行', () => {
  const cwd = project('patch-internal', planFlow);
  const reason = projectOnly(execution('apply_patch', cwd, {
    patch: '*** Begin Patch\n*** Update File: .openfeel/plan/v1/stage-1/plan.md\n@@\n-a\n+b\n*** End Patch',
  }));
  assert.equal(reason, undefined);
});

check('apply_patch：混合目标拒绝（B9）', () => {
  const cwd = project('patch-mixed', planFlow);
  const reason = projectOnly(execution('apply_patch', cwd, {
    patch: '*** Begin Patch\n*** Update File: .openfeel/plan/x.md\n*** Update File: src/foo.cs\n@@\n-a\n+b\n*** End Patch',
  }));
  assert.equal(typeof reason, 'string');
});

check('apply_patch：全部外部拒绝', () => {
  const cwd = project('patch-external', planFlow);
  const reason = projectOnly(execution('apply_patch', cwd, {
    patch: '*** Begin Patch\n*** Update File: src/foo.cs\n@@\n-a\n+b\n*** End Patch',
  }));
  assert.equal(typeof reason, 'string');
});

check('apply_patch：flow.json 拒绝', () => {
  const cwd = project('patch-flow', planFlow);
  const reason = projectOnly(execution('apply_patch', cwd, {
    patch: '*** Begin Patch\n*** Update File: .openfeel/flow.json\n@@\n-a\n+b\n*** End Patch',
  }));
  assert.equal(typeof reason, 'string');
});

check('apply_patch：无标准头拒绝', () => {
  const cwd = project('patch-no-header', planFlow);
  const reason = projectOnly(execution('apply_patch', cwd, { patch: 'just text' }));
  assert.equal(typeof reason, 'string');
});

check('apply_patch：Move to 缺少同块 Update File 源拒绝（N8）', () => {
  const cwd = project('patch-move', planFlow);
  const reason = projectOnly(execution('apply_patch', cwd, {
    patch: '*** Begin Patch\n*** Move to: .openfeel/plan/y.md\n*** End Patch',
  }));
  assert.equal(typeof reason, 'string');
});

check('apply_patch：Move 必须同块 Update（B2）', () => {
  const bad = parsePatchTargets('*** Update File: .openfeel/plan/x.md\n*** Add File: src/new.cs\n*** Move to: src/outside.cs');
  assert.equal(bad.ok, false);
  const ok = parsePatchTargets('*** Update File: .openfeel/plan/x.md\n*** Move to: .openfeel/plan/y.md');
  assert.deepEqual({ ok: ok.ok, paths: ok.paths }, { ok: true, paths: ['.openfeel/plan/x.md', '.openfeel/plan/y.md'] });
});

check('apply_patch：Add/Delete/--- 正目标解析', () => {
  const add = parsePatchTargets('*** Add File: .openfeel/plan/x.md');
  assert.deepEqual({ ok: add.ok, paths: add.paths }, { ok: true, paths: ['.openfeel/plan/x.md'] });
  const del = parsePatchTargets('*** Delete File: src/foo.cs');
  assert.deepEqual({ ok: del.ok, paths: del.paths }, { ok: true, paths: ['src/foo.cs'] });
  const diff = parsePatchTargets('--- a/src/foo.cs\n+++ b/src/foo.cs');
  assert.deepEqual({ ok: diff.ok, paths: diff.paths }, { ok: true, paths: ['src/foo.cs'] });
});

check('apply_patch：Add 内部放行 / Delete 外部拒绝', () => {
  const cwd = project('patch-add-delete', execFlow);
  assert.equal(projectOnly(execution('apply_patch', cwd, {
    patch: '*** Add File: .openfeel/plan/new.md',
  })), undefined);
  assert.equal(typeof projectOnly(execution('apply_patch', project('patch-delete', planFlow), {
    patch: '*** Delete File: src/foo.cs',
  })), 'string');
});

check('apply_patch：引号路径去引号（N8）', () => {
  const parsed = parsePatchTargets('*** Update File: "src/foo.cs"');
  assert.deepEqual({ ok: parsed.ok, paths: parsed.paths }, { ok: true, paths: ['src/foo.cs'] });
});

check('apply_patch：/dev/null 被忽略（N8）', () => {
  const parsed = parsePatchTargets('--- /dev/null\n+++ b/src/foo.cs');
  assert.deepEqual({ ok: parsed.ok, paths: parsed.paths }, { ok: true, paths: ['src/foo.cs'] });
});

check('str_replace_editor：flow.json 拒绝，内部产物放行', () => {
  const cwd = project('str-editor', planFlow);
  assert.equal(typeof projectOnly(execution('str_replace_editor', cwd, { path: '.openfeel/flow.json' })), 'string');
  assert.equal(projectOnly(execution('str_replace_editor', cwd, { path: '.openfeel/plan/x.md' })), undefined);
});

check('normalizeForComparison 平台分支（B1）', () => {
  assert.equal(normalizeForComparison('/X/.OPENFEEL/FLOW.JSON', 'darwin'), '/x/.openfeel/flow.json');
  assert.equal(normalizeForComparison('/X/.OPENFEEL/FLOW.JSON', 'win32'), '/x/.openfeel/flow.json');
  assert.equal(normalizeForComparison('/X/.OPENFEEL/FLOW.JSON', 'linux'), '/X/.OPENFEEL/FLOW.JSON');
});

check('Windows/macOS 大小写变体（仅大小写不敏感 FS）', () => {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  const cwd = project('case-paths', planFlow);
  const forward = projectOnly(execution('edit', cwd, { path: '.OPENFEEL/FLOW.JSON' }));
  assert.match(String(forward), /禁止手改|never hand-edit/);
  if (process.platform === 'win32') {
    const backslash = projectOnly(execution('edit', cwd, { path: '.OPENFEEL\\FLOW.JSON' }));
    assert.match(String(backslash), /禁止手改|never hand-edit/);
  }
});

check('bootstrap：always / project / off 文案不同', () => {
  const strict = renderBootstrapPrompt({ language: 'zh-CN', enforce: 'always' });
  const relaxed = renderBootstrapPrompt({ language: 'zh-CN', enforce: 'project' });
  const disabled = renderBootstrapPrompt({ language: 'zh-CN', enforce: 'off' });
  assert.match(strict, /enforce=always/);
  assert.match(strict, /拒绝/);
  assert.match(relaxed, /enforce=project/);
  assert.match(disabled, /enforce=off/);
  assert.doesNotMatch(strict, /用户拒绝后直接改/);
});

check('bootstrap：英文', () => {
  const text = renderBootstrapPrompt({ language: 'en', enforce: 'always' });
  assert.match(text, /not initialized/);
  assert.match(text, /enforce=always/);
});

check('完整提示：detected=false 不误报已初始化', () => {
  const text = renderFeelPrompt({ language: 'zh-CN', detected: false });
  assert.match(text, /尚未检测到/);
  assert.doesNotMatch(text, /已初始化 `\.openfeel\/`/);
});

check('完整提示：detected=true 显示已初始化', () => {
  const text = renderFeelPrompt({ language: 'zh-CN', detected: true, projectRoot: root });
  assert.match(text, /已初始化/);
});

// ── v1.3.3-stage-104：P0-1 bootstrap 例外 / P0-4 doc-note 不绑相位 ─────

check('P0-1 bootstrap：空仓新增文件放行', () => {
  const cwd = workspace('bootstrap-new');
  assert.equal(always(execution('write', cwd, { path: 'src/x.ts' })), undefined);
});

check('P0-1 bootstrap：空仓新文件（嵌套目录）放行', () => {
  const cwd = workspace('bootstrap-nested');
  assert.equal(always(execution('edit', cwd, { file_path: 'docs/a/b.md' })), undefined);
});

check('P0-1 bootstrap：已存在文件仍拒绝', () => {
  const cwd = workspace('bootstrap-existing');
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'x.ts'), 'x', 'utf8');
  assert.match(String(always(execution('write', cwd, { path: 'src/x.ts' }))), /尚未初始化|not OpenFeel-initialized/);
});

check('P0-1 bootstrap：apply_patch Add 放行 / Update 拒绝', () => {
  const addCwd = workspace('bootstrap-patch-add');
  const addPatch = '*** Begin Patch\n*** Add File: src/a.ts\n+x\n*** End Patch\n';
  assert.equal(always(execution('apply_patch', addCwd, { patch: addPatch })), undefined);
  const updCwd = workspace('bootstrap-patch-update');
  const updPatch = '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-x\n+y\n*** End Patch\n';
  assert.match(String(always(execution('apply_patch', updCwd, { patch: updPatch }))), /尚未初始化|not OpenFeel-initialized/);
});

check('P0-1 bootstrap：工作区外路径拒绝（防 ../ 越界）', () => {
  const cwd = workspace('bootstrap-escape');
  const outside = join(root, 'outside-target.ts');
  assert.match(String(always(execution('write', cwd, { path: outside }))), /尚未初始化|not OpenFeel-initialized/);
});

check('P0-4：源码目录名为 docs 不视为文档（src/docs/x.ts 仍按源码门）', () => {
  const cwd = project('doc-src-docs', planFlow);
  assert.match(String(projectOnly(execution('write', cwd, { path: 'src/docs/x.ts' }))), /exec_running/);
});

check('P0-4：无活跃阶段写 docs 放行 / 源码拒绝', () => {
  const cwd = project('doc-no-stage', noStageFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: 'docs/notes.md' })), undefined);
  assert.match(String(projectOnly(execution('write', cwd, { path: 'src/a.ts' }))), /无活跃阶段|no active stage/);
});

check('P0-4：plan 相位写 docs / 根 README 放行，源码拒绝', () => {
  const cwd = project('doc-plan-phase', planFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: 'docs/design/api.md' })), undefined);
  assert.equal(projectOnly(execution('write', cwd, { path: 'README.md' })), undefined);
  assert.match(String(projectOnly(execution('write', cwd, { path: 'src/a.ts' }))), /exec_running/);
});

check('P0-4：doc + src 混合目标从严（拒绝）', () => {
  const cwd = project('doc-mixed', noStageFlow);
  const patch = '*** Begin Patch\n*** Add File: docs/a.md\n+x\n*** Add File: src/a.ts\n+y\n*** End Patch\n';
  assert.match(String(projectOnly(execution('apply_patch', cwd, { patch }))), /无活跃阶段|no active stage/);
});

check('P0-4：exec_running 相位源码照常放行（零回归）', () => {
  const cwd = project('doc-exec', execFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: 'src/a.ts' })), undefined);
});

// ── v1.4.0：静态展示资源与 doc 同层 + 审计 ───────────────────────────

/** 读取某工作区的 guard 审计行（JSONL） */
function readAudit(cwd) {
  const auditPath = join(cwd, '.openfeel', 'log', 'guard-audit.jsonl');
  assert.ok(existsSync(auditPath), `缺少审计文件 ${auditPath}`);
  return readFileSync(auditPath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
}

check('v1.4.0：isPresentationalAssetPath 判定（扩展名 + assets/public 目录）', () => {
  assert.equal(isPresentationalAssetPath('/x/web/index.html'), true);
  assert.equal(isPresentationalAssetPath('/x/web/style.css'), true);
  assert.equal(isPresentationalAssetPath('/x/crates/cli/assets/index.html'), true);
  assert.equal(isPresentationalAssetPath('/x/public/logo.webp'), true);
  assert.equal(isPresentationalAssetPath('/x/src/main.rs'), false);
  assert.equal(isPresentationalAssetPath('/x/src/app.ts'), false);
  assert.equal(isPresentationalAssetPath('/x/assets/gen.ts'), false);
  assert.equal(isPresentationalAssetPath('/x/public/app.js'), false);
  assert.equal(isPresentationalAssetPath('/x/assets/logo.svg'), true);
});

check('v1.4.0：done 后写 web/index.html 放行 + 审计记录', () => {
  const cwd = project('asset-done', noStageFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: 'web/index.html' })), undefined);
  const rows = readAudit(cwd);
  const last = rows.at(-1);
  assert.equal(last.reason, 'doc-asset');
  assert.equal(last.tool, 'write');
  assert.equal(last.phase, 'done');
  assert.ok(last.paths.some((p) => p.endsWith('index.html')), `审计 paths 缺 index.html: ${JSON.stringify(last.paths)}`);
});

check('v1.4.0：done 后写嵌套 crates/cli/assets/index.html 放行', () => {
  const cwd = project('asset-nested', noStageFlow);
  assert.equal(projectOnly(execution('edit', cwd, { path: 'crates/cli/assets/index.html' })), undefined);
});

check('v1.4.0：done 后写 src/main.rs 仍拒（错误文案不变）', () => {
  const cwd = project('asset-src', noStageFlow);
  const reason = projectOnly(execution('write', cwd, { path: 'src/main.rs' }));
  assert.match(String(reason), /无活跃阶段，不能修改源码\/文档/);
});

check('v1.4.0：静态资源 + 源码混合目标从严（拒绝）', () => {
  const cwd = project('asset-mixed', noStageFlow);
  const patch = '*** Begin Patch\n*** Add File: web/index.html\n+x\n*** Add File: src/main.rs\n+y\n*** End Patch\n';
  assert.match(String(projectOnly(execution('apply_patch', cwd, { patch }))), /无活跃阶段|no active stage/);
});

check('v1.4.0：plan 相位写静态资源放行 + 审计 phase 含阶段相位', () => {
  const cwd = project('asset-plan', planFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: 'web/app.css' })), undefined);
  const last = readAudit(cwd).at(-1);
  assert.equal(last.reason, 'doc-asset');
  assert.match(String(last.phase), /plan_review/);
});

check('D-126-03：chore 窗口无 source_allowed → 源码拒（文案指向 --source），doc 仍放行', () => {
  const cwd = project('chore-no-source', noStageFlow);
  mkdirSync(join(cwd, '.openfeel'), { recursive: true });
  writeFileSync(
    join(cwd, '.openfeel', 'chore.json'),
    JSON.stringify({ id: 'CHORE-doc', note: 'ui tweak', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), stage_count_at_start: 1 }),
    'utf8',
  );
  clearGuardCache();
  const reason = projectOnly(execution('write', cwd, { path: 'src/main.rs' }));
  assert.match(String(reason), /openfeel chore --source/);
  assert.equal(readAudit(cwd).at(-1).event, 'guard_deny');
  assert.equal(readAudit(cwd).at(-1).reason, 'chore-source');
  // 默认窗口仍覆盖 doc/静态资源（这些本来无需 chore）。
  assert.equal(projectOnly(execution('write', cwd, { path: 'docs/notes.md' })), undefined);
});

check('D-126-03：chore --source（source_allowed:true）→ 源码放行 + 审计 reason=chore', () => {
  const cwd = project('chore-source', noStageFlow);
  mkdirSync(join(cwd, '.openfeel'), { recursive: true });
  writeFileSync(
    join(cwd, '.openfeel', 'chore.json'),
    JSON.stringify({ id: 'CHORE-src', note: 'behaviour tweak', source_allowed: true, started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), stage_count_at_start: 1 }),
    'utf8',
  );
  clearGuardCache();
  assert.equal(projectOnly(execution('write', cwd, { path: 'src/main.rs' })), undefined);
  assert.equal(readAudit(cwd).at(-1).reason, 'chore');
});

check('v1.4.0：chore 过期 → 源码仍拒', () => {
  const cwd = project('chore-expired', noStageFlow);
  writeFileSync(
    join(cwd, '.openfeel', 'chore.json'),
    JSON.stringify({ id: 'CHORE-old', note: 'x', started_at: '2020-01-01T00:00:00.000Z', expires_at: '2020-01-01T00:01:00.000Z', stage_count_at_start: 1 }),
    'utf8',
  );
  clearGuardCache();
  assert.match(String(projectOnly(execution('write', cwd, { path: 'src/main.rs' }))), /无活跃阶段|no active stage/);
});

check('v1.4.0：存在活跃阶段时 chore 不生效（不绕过相位门）', () => {
  const cwd = project('chore-active', planFlow);
  writeFileSync(
    join(cwd, '.openfeel', 'chore.json'),
    JSON.stringify({ id: 'CHORE-active', note: 'x', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), stage_count_at_start: 1 }),
    'utf8',
  );
  clearGuardCache();
  assert.match(String(projectOnly(execution('write', cwd, { path: 'src/main.rs' }))), /exec_running/);
});

check('v1.5.2：无活跃阶段写 docs/research/** 被拒（入口闸）', () => {
  const cwd = project('research-done', noStageFlow);
  const reason = projectOnly(execution('write', cwd, { path: 'docs/research/topic.md' }));
  assert.match(String(reason), /研究\/方案产物/);
  assert.match(String(reason), /feel_req add/);
  const last = readAudit(cwd).at(-1);
  assert.equal(last.event, 'guard_deny');
  assert.equal(last.reason, 'research-needs-stage');
});

check('v1.5.2：有活跃阶段写 docs/research/** 放行；普通 docs 仍零回归', () => {
  const cwd = project('research-plan', planFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: 'docs/research/topic.md' })), undefined);
  const done = project('docs-plain', noStageFlow);
  assert.equal(projectOnly(execution('write', done, { path: 'docs/notes.md' })), undefined);
});

check('v1.5.2：chore 不能绕过研究产物的阶段要求', () => {
  const cwd = project('research-chore', noStageFlow);
  writeFileSync(
    join(cwd, '.openfeel', 'chore.json'),
    JSON.stringify({ id: 'CHORE-r', note: 'x', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), stage_count_at_start: 1 }),
    'utf8',
  );
  clearGuardCache();
  const reason = projectOnly(execution('write', cwd, { path: 'docs/research/topic.md' }));
  assert.match(String(reason), /研究\/方案产物/);
});

// ── v1.5.11-stage-126：D-126-05 受保护路径 / D-126-06 豁免收窄 ─────────

check('D-126-05：exec_running 下写 .openfeel/chore.json 仍拒（相位放行不能盖过保护）', () => {
  const cwd = project('protect-chore', execFlow);
  const reason = projectOnly(execution('write', cwd, { path: '.openfeel/chore.json' }));
  assert.equal(typeof reason, 'string');
  assert.match(String(reason), /禁止手改|never hand-edit/);
  assert.match(String(reason), /openfeel chore/);
  assert.match(String(reason), /人类|human/);
});

check('D-126-05：dev 账本（preflight / sessions / guard-state）在 exec_running 下仍拒', () => {
  const cwd = project('protect-dev', execFlow);
  const cases = [
    ['.openfeel/dev/.preflight.json', /feel_status|feel_next/],
    ['.openfeel/dev/sessions.json', /feel_\*|心跳/],
    ['.openfeel/dev/guard-state.json', /guard 段|feel_status/],
  ];
  for (const [path, pattern] of cases) {
    const reason = projectOnly(execution('write', cwd, { path }));
    assert.equal(typeof reason, 'string', path);
    assert.match(String(reason), pattern, path);
  }
});

check('D-126-05：flow-archive / checkpoints / requirements/*.md 在 exec_running 下仍拒', () => {
  const cwd = project('protect-ledgers', execFlow);
  const cases = [
    ['.openfeel/flow-archive/v1.5.10.json', /feel_archive/],
    ['.openfeel/checkpoints/v1-stage-1-20260101T000000-exec_running.json', /feel_checkpoint/],
    ['.openfeel/requirements/REQ-001.md', /feel_req/],
  ];
  for (const [path, pattern] of cases) {
    const reason = projectOnly(execution('edit', cwd, { path }));
    assert.equal(typeof reason, 'string', path);
    assert.match(String(reason), pattern, path);
  }
});

check('D-126-05：log/guard-audit.jsonl 单文件保护；log/** 其它文件仍放行（不整目录保护）', () => {
  const cwd = project('protect-audit', execFlow);
  const denied = projectOnly(execution('write', cwd, { path: '.openfeel/log/guard-audit.jsonl' }));
  assert.equal(typeof denied, 'string');
  assert.match(String(denied), /审计|guard 自动追加/);
  // exec_running 与 plan_review 下，log/ 的普通文件都不受保护（走内部路径早返回）。
  assert.equal(projectOnly(execution('write', cwd, { path: '.openfeel/log/log.md' })), undefined);
  const planCwd = project('protect-audit-plan', planFlow);
  assert.equal(projectOnly(execution('write', planCwd, { path: '.openfeel/log/notes.md' })), undefined);
});

check('D-126-05：flow.json / flow.json.bak / status.md 回归（exec_running 下仍拒）', () => {
  const cwd = project('protect-state', execFlow);
  assert.match(String(projectOnly(execution('write', cwd, { path: '.openfeel/flow.json' }))), /禁止手改/);
  assert.match(String(projectOnly(execution('write', cwd, { path: '.openfeel/flow.json.bak' }))), /禁止手改/);
  assert.match(String(projectOnly(execution('edit', cwd, { path: '.openfeel/plan/v1/stage-1/status.md' }))), /禁止手改/);
});

check('D-126-05：apply_patch 写受保护路径同样拒绝', () => {
  const cwd = project('protect-patch', execFlow);
  const patch = '*** Begin Patch\n*** Update File: .openfeel/chore.json\n@@\n-a\n+b\n*** End Patch';
  assert.match(String(projectOnly(execution('apply_patch', cwd, { patch }))), /禁止手改/);
});

check('D-126-05：大小写变体不可绕过（Windows/macOS）', () => {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  const cwd = project('protect-case', execFlow);
  assert.match(String(projectOnly(execution('write', cwd, { path: '.OPENFEEL/CHORE.JSON' }))), /禁止手改/);
  assert.match(String(projectOnly(execution('write', cwd, { path: '.OpenFeel/dev/.PREFLIGHT.JSON' }))), /禁止手改/);
});

check('D-126-06：代码目录内 doc/asset 一律按源码门禁（plan_review 下全拒）', () => {
  const cwd = project('code-dir-deny', planFlow);
  for (const path of ['src/x.md', 'src/x.css', 'src/assets/a.png', 'src/assets/logo.svg', 'src/x.ts']) {
    assert.match(String(projectOnly(execution('write', cwd, { path }))), /exec_running/, path);
  }
});

check('D-126-06：test / scripts / dsh / bin 根级目录同样不豁免', () => {
  const cwd = project('code-dir-all', planFlow);
  for (const path of ['test/notes.md', 'scripts/readme.md', 'dsh/ADAPTER.md', 'bin/readme.txt']) {
    assert.equal(typeof projectOnly(execution('write', cwd, { path })), 'string', path);
  }
});

check('D-126-06：豁免仍在（docs/**、根 README、public、assets、根 LICENSE）', () => {
  const cwd = project('exempt-allow', planFlow);
  for (const path of ['docs/x.md', 'README.md', 'public/a.png', 'assets/logo.svg', 'LICENSE']) {
    assert.equal(projectOnly(execution('write', cwd, { path })), undefined, path);
  }
  // 非代码目录的展示资源仍按 doc/asset 放行（零回归）。
  assert.equal(projectOnly(execution('edit', cwd, { path: 'web/index.html' })), undefined);
});

check('D-126-06：不误伤 docs/src-notes.md（文件名不是目录段）', () => {
  const cwd = project('code-dir-false-positive', planFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: 'docs/src-notes.md' })), undefined);
});

check('D-126-06：exec_running 下代码目录内 doc/asset 仍放行（只收紧豁免，不改相位语义）', () => {
  const cwd = project('code-dir-exec', execFlow);
  assert.equal(projectOnly(execution('write', cwd, { path: 'src/x.md' })), undefined);
  assert.equal(projectOnly(execution('write', cwd, { path: 'src/assets/logo.svg' })), undefined);
  assert.equal(projectOnly(execution('write', cwd, { path: 'dsh/notes.md' })), undefined);
});

check('D-126-06：无活跃阶段写 src/x.md 被拒（文案给「开会话/开阶段」出路）', () => {
  const cwd = project('code-dir-nostage', noStageFlow);
  const reason = projectOnly(execution('write', cwd, { path: 'src/x.md' }));
  assert.match(String(reason), /无活跃阶段/);
  assert.match(String(reason), /feel_stage add/);
});

check('R9 防自锁：touchSession 直写 dev/sessions.json、recordGuardAudit 直写审计（不经工具路径）', () => {
  const cwd = project('self-lock', planFlow);
  touchSession(cwd, 'v1-stage-1');
  const sessionsPath = join(cwd, '.openfeel', 'dev', 'sessions.json');
  assert.ok(existsSync(sessionsPath), `touchSession 应写成功（fs 直写不经 guard）：${sessionsPath}`);
  assert.ok(JSON.parse(readFileSync(sessionsPath, 'utf-8')).sessions.length >= 1);
  // 真实判定触发 recordGuardAudit（doc-asset 放行），审计文件必须照常追加。
  assert.equal(projectOnly(execution('write', cwd, { path: 'docs/notes.md' })), undefined);
  assert.equal(readAudit(cwd).at(-1).reason, 'doc-asset');
});

// ── v1.5.11 D-126-02：shell 写通道门禁（bash / pwsh） ──────────────────

/** 真机 shell 工具调用：参数是 `command` + `workdir`。 */
function shellExec(tool, cwd, command, workdir) {
  const args = { command };
  if (workdir !== undefined) args.workdir = workdir;
  return execution(tool, cwd, args);
}

/** 按档位临时创建 guard（避免环境变量干扰其它用例）。 */
function guardWithShellGate(mode) {
  const previous = process.env.OPENFEEL_SHELL_GATE;
  delete process.env.OPENFEEL_SHELL_GATE;
  try {
    return createOpenFeelGuard({ enforce: 'project', language: 'zh-CN', shellGate: mode });
  } finally {
    if (previous === undefined) delete process.env.OPENFEEL_SHELL_GATE;
    else process.env.OPENFEEL_SHELL_GATE = previous;
  }
}

check('D-126-02 ①：pwsh Set-Content src/x.ts 在 plan_review → 拒且文件未生成', () => {
  const cwd = project('shell-pwsh-src', planFlow);
  const reason = projectOnly(shellExec('pwsh', cwd, "Set-Content src/x.ts 'x'"));
  assert.equal(typeof reason, 'string');
  assert.match(String(reason), /不能修改源码\/文档/);
  assert.equal(existsSync(join(cwd, 'src', 'x.ts')), false);
});

check('D-126-02 ②：pwsh 写 src/x.md 也被拒（与 D-126-06 叠加，无借道）', () => {
  const cwd = project('shell-pwsh-md', planFlow);
  for (const command of [
    "Set-Content src/x.md 'x'",
    "Set-Content -Path src/assets/logo.svg -Value 'x'",
    "Add-Content -LiteralPath src/x.css -Value 'x'",
  ]) {
    assert.match(String(projectOnly(shellExec('pwsh', cwd, command))), /不能修改源码\/文档/, command);
  }
});

check('D-126-02：bash 重定向写源码 → 拒且文件未生成', () => {
  const cwd = project('shell-bash-redirect', planFlow);
  for (const command of ['echo x > src/probe.ts', 'echo x >> src/probe.ts', 'echo x >"src/probe.ts"', 'printf x 2> src/err.log']) {
    assert.match(String(projectOnly(shellExec('bash', cwd, command))), /不能修改源码\/文档/, command);
  }
  assert.equal(existsSync(join(cwd, 'src', 'probe.ts')), false);
});

check('D-126-02 ③：git 工作区写（checkout --/restore/reset --hard/stash pop/clean）→ 拒', () => {
  const cwd = project('shell-git-write', planFlow);
  for (const command of [
    'git checkout -- src/',
    'git checkout -- src/a.ts',
    'git restore .',
    'git reset --hard',
    'git reset --merge HEAD',
    'git stash pop',
    'git stash apply',
    'git clean -fd',
  ]) {
    assert.equal(typeof projectOnly(shellExec('bash', cwd, command)), 'string', command);
  }
});

check('D-126-02 ④：git status / log / diff 放行（不误杀只读查询）', () => {
  const cwd = project('shell-git-read', planFlow);
  for (const command of ['git status', 'git status --porcelain', 'git log --oneline -3', 'git diff', 'git branch -a', 'git fetch origin']) {
    assert.equal(projectOnly(shellExec('bash', cwd, command)), undefined, command);
  }
});

check('D-126-02：git commit 无 exec_running → 拒；有 exec_running → 放行（消息里的路径不误判）', () => {
  const denied = project('shell-git-commit-plan', planFlow);
  assert.match(String(projectOnly(shellExec('bash', denied, 'git commit -m "x"'))), /git 工作区写/);
  const allowed = project('shell-git-commit-exec', execFlow);
  assert.equal(projectOnly(shellExec('bash', allowed, 'git commit -m "fix src/x.ts"')), undefined);
  assert.equal(projectOnly(shellExec('bash', allowed, 'git reset --hard')), undefined);
});

check('D-126-02：git apply 按 patch 头目标判定', () => {
  const cwd = project('shell-git-apply', planFlow);
  const patch = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@\n-a\n+b\n';
  writeFileSync(join(cwd, 'change.diff'), patch, 'utf8');
  assert.match(String(projectOnly(shellExec('bash', cwd, 'git apply change.diff'))), /不能修改源码\/文档/);
  writeFileSync(join(cwd, 'docs.diff'), '--- a/docs/x.md\n+++ b/docs/x.md\n', 'utf8');
  assert.equal(projectOnly(shellExec('bash', cwd, 'git apply docs.diff')), undefined);
});

check('D-126-02 ⑤：构建/测试命令不误杀（npx vitest / npm run build / cargo build / tsc -b）', () => {
  const cwd = project('shell-build-allow', planFlow);
  for (const command of [
    'npx vitest run test/commands/chore.test.ts',
    'npm run build',
    'npm install',
    'cargo build --release',
    'tsc -b',
    'pnpm exec vite build',
  ]) {
    assert.equal(projectOnly(shellExec('bash', cwd, command)), undefined, command);
    // op-005：这些必须落在「确认只读/构建」（kind=none），不是第 4 类告警。
    assert.equal(readAudit(cwd).at(-1).kind, 'none', command);
  }
  // `node <脚本>` 不再是「构建命令」：脚本内容不可见 → 第 4 类（用例如 op-005 段）。
  assert.equal(readAudit(cwd).at(-1).reason, 'shell-no-write');
});

check('D-126-02 第 3 类：产物豁免（dist/build/out/target/.next/node_modules/.openfeel/tmp/*.tsbuildinfo/lock）', () => {
  const cwd = project('shell-artifact', planFlow);
  for (const target of [
    'dist/x.js',
    'build/x.js',
    'out/x.js',
    'target/debug/x',
    '.next/x.js',
    'node_modules/x/index.js',
    'coverage/x.json',
    '.openfeel/tmp/x.json',
    '.cache/x',
    'app.tsbuildinfo',
    'pnpm-lock.yaml',
    'package-lock.json',
  ]) {
    assert.equal(projectOnly(shellExec('pwsh', cwd, `Set-Content ${target} '1'`)), undefined, target);
  }
  // 混合目标从严：产物 + 源码 → 拒
  assert.equal(typeof projectOnly(shellExec('pwsh', cwd, "Set-Content dist/a '1'; Set-Content src/a.ts '1'")), 'string');
});

check('D-126-02 ⑥：shell 跑 openfeel 写命令 → 拒（文案给出正确出口）', () => {
  const cwd = project('shell-openfeel-write', planFlow);
  for (const command of [
    'openfeel flow advance --stage v1-stage-1 --to exec_running',
    'openfeel stage set v1-stage-1 status=done',
    'openfeel req claim REQ-1',
    'openfeel chore "临时改一行"',
    'npx openfeel flow advance --stage x',
    'openfeel "flow" advance --stage x',
  ]) {
    const reason = projectOnly(shellExec('pwsh', cwd, command));
    assert.match(String(reason), /禁止用 shell 跑 openfeel 写命令/, command);
  }
});

check('D-126-02 ⑦：shell 跑 openfeel 只读子命令 → 放行', () => {
  const cwd = project('shell-openfeel-read', planFlow);
  for (const command of [
    'openfeel flow status',
    'openfeel flow current',
    'openfeel flow next --json',
    'openfeel stage list',
    'openfeel req board',
    'openfeel chore --end',
    'openfeel chore --status',
    'openfeel flow plan stage list',
    'openfeel flow checkpoint list',
    'openfeel dev sync',
  ]) {
    assert.equal(projectOnly(shellExec('pwsh', cwd, command)), undefined, command);
  }
});

check('D-126-02 第 2 类：受保护路径（写入目标维度）→ 硬拒', () => {
  const cwd = project('shell-protected', execFlow);
  for (const command of [
    "Set-Content .openfeel/flow.json 'x'",
    "Set-Content .openfeel/plan/v1/stage-1/status.md 'x'",
    "Copy-Item src/a.ts .openfeel/flow.json",
    "Set-Content .openfeel/log/guard-audit.jsonl 'x'",
  ]) {
    assert.match(String(projectOnly(shellExec('pwsh', cwd, command))), /禁止手改|受保护/, command);
  }
  // 反向：源只读（受保护）、目标在工作区外（且不可解析）→ 放行（第 4 类告警）
  assert.equal(projectOnly(shellExec('pwsh', cwd, 'Copy-Item .openfeel/flow.json $env:TEMP\\f.json')), undefined);
});

check('D-126-02：受保护路径经 shell 与 write 两条路径都拒（exec_running 下也拒）', () => {
  const cwd = project('shell-protected-audit', execFlow);
  assert.equal(typeof projectOnly(shellExec('bash', cwd, 'echo x > .openfeel/flow.json')), 'string');
  assert.equal(typeof projectOnly(execution('write', cwd, { path: '.openfeel/flow.json' })), 'string');
});

check('D-126-02 / op-002b：硬拒形态（内容不可见）+ 引号程序名 → 拒', () => {
  const cwd = project('shell-indirect', planFlow);
  for (const [tool, command] of [
    ['pwsh', 'pwsh -EncodedCommand JABzAGUAdAA='],
    ['pwsh', 'powershell -EncodedCommand JABzAGUAdAA='],
    ['pwsh', 'iex "Set-Content src/x.ts 1"'],
    ['pwsh', 'Invoke-Expression "Set-Content src/x.ts 1"'],
    ['bash', 'eval "echo 1 > src/x.ts"'],
    ['bash', 'cmd /c "echo 1 > src/x.ts"'],
    ['bash', '"bash" -c "echo 1 > src/x.ts"'],
  ]) {
    // `"bash" -c …` 走递归解析 → 命中的是相位拒绝；其余是「嵌套解释器」文案
    const reason = String(projectOnly(shellExec(tool, cwd, command)));
    assert.match(reason, /嵌套解释器|编码执行|不能修改源码\/文档/, `${tool}: ${command}`);
  }
  assert.equal(existsSync(join(cwd, 'src', 'x.ts')), false);
});

check('op-002b：内联解释器先扫 payload——含写 API 才拒，且文件未生成', () => {
  const cwd = project('shell-indirect-write', planFlow);
  for (const [tool, command] of [
    ['bash', 'node -e "require(\'fs\').writeFileSync(\'src/x.ts\',\'\')"'],
    ['bash', 'node -e "fs.copyFileSync(\'a.ts\',\'src/x.ts\')"'],
    ['bash', 'python -c "open(\'src/x.ts\',\'w\').write(\'1\')"'],
    ['bash', 'node -e "fs.promises.writeFile(\'src/x.ts\',\'\')"'],
  ]) {
    const reason = projectOnly(shellExec(tool, cwd, command));
    assert.match(String(reason), /嵌套解释器|编码执行/, `${tool}: ${command}`);
  }
  assert.equal(existsSync(join(cwd, 'src', 'x.ts')), false);
});

check('op-002b：只读内联解释器放行且不写审计（日常诊断零噪音）', () => {
  const cwd = project('shell-indirect-read', planFlow);
  for (const command of [
    'node -e "console.log(1)"',
    'node -e "console.log(JSON.parse(require(\'fs\').readFileSync(\'package.json\',\'utf8\')))"',
    'python -c "print(1)"',
    'perl -e "print 1"',
    'php -r "echo 1;"',
  ]) {
    assert.equal(projectOnly(shellExec('bash', cwd, command)), undefined, command);
  }
  assert.equal(existsSync(join(cwd, '.openfeel', 'log', 'guard-audit.jsonl')), false);
});

check('op-002b：只读 payload 也不能借重定向写源码（重定向单独判定）', () => {
  const cwd = project('shell-interpreter-redirect', planFlow);
  assert.match(String(projectOnly(shellExec('bash', cwd, 'node -e "console.log(1)" > src/x.ts'))), /不能修改源码\/文档/);
  assert.match(String(projectOnly(shellExec('bash', cwd, "bash -c 'git status' > src/x.ts"))), /不能修改源码\/文档/);
  // 重定向到产物目录不误杀
  assert.equal(projectOnly(shellExec('bash', cwd, 'node -e "console.log(1)" > dist/out.txt')), undefined);
});

check('op-002b：`-c` / `-Command` 递归解析内层命令（同一判定器）', () => {
  const cwd = project('shell-wrapper', planFlow);
  // 内层可判定 → 按内层判
  for (const command of [
    "bash -c 'echo hi > src/x.ts'",
    'sh -c "echo hi > src/x.ts"',
    'powershell -Command "Set-Content src/x.ts 1"',
    'pwsh -Command "Set-Content src/x.ts 1"',
  ]) {
    assert.match(String(projectOnly(shellExec('bash', cwd, command))), /不能修改源码\/文档/, command);
  }
  // 内层只读 → 放行
  for (const command of ["bash -c 'git status'", 'powershell -Command "Get-Content .openfeel/flow.json"']) {
    assert.equal(projectOnly(shellExec('bash', cwd, command)), undefined, command);
  }
  // 内层为空/不可解析 → 第 4 类（默认告警放行，strict 下拒）
  const emptyCwd = project('shell-wrapper-empty', planFlow);
  assert.equal(projectOnly(shellExec('bash', emptyCwd, 'bash -c "$CMD"')), undefined);
  const strict = guardWithShellGate('strict');
  assert.match(String(strict(shellExec('bash', emptyCwd, 'bash -c "$CMD"'))), /无法静态判定/);
});

check('D-126-02 第 2 类：POSIX 写命令（rm/mv/cp/touch/mkdir/sed -i/tee）按目标判', () => {
  const cwd = project('shell-posix', planFlow);
  for (const command of ['rm -rf src/a.ts', 'mv src/a.ts /tmp/a.ts', 'touch src/a.ts', "sed -i 's/a/b/' src/a.ts", 'echo x | tee src/a.ts']) {
    assert.equal(typeof projectOnly(shellExec('bash', cwd, command)), 'string', command);
  }
  // 只读/产物/文档目标不误杀
  assert.equal(projectOnly(shellExec('bash', cwd, 'sed "s/a/b/" src/a.ts')), undefined);
  assert.equal(projectOnly(shellExec('bash', cwd, 'mkdir -p dist/new')), undefined);
  assert.equal(projectOnly(shellExec('bash', cwd, 'touch docs/x.md')), undefined);
});

// **已知敞口（op-005 口径）**：下面「变量拼接」用例的 `undefined` **不是**
// 「allow 是正确行为」，而是第 4 类默认 `warn` 的表现 —— 审计里必须同时看到
// `guard_shell_unresolved` / `decision=warn` / `kind=undecidable`。要提高保证就把
// 宿主设 `OPENFEEL_SHELL_GATE=strict`（第 4 类也拒）；别把这里读成「拼接可以放行」。
check('D-126-02 第 2 类：变量「单次字面量赋值」→ 拒；拼接/派生 → 第 4 类告警', () => {
  const cwd = project('shell-var-literal', planFlow);
  assert.equal(typeof projectOnly(shellExec('pwsh', cwd, "$f='src/x.ts'; Set-Content $f '1'")), 'string');
  assert.equal(typeof projectOnly(shellExec('bash', cwd, 'F=src/x.ts; echo 1 > "$F"')), 'string');

  const warnCwd = project('shell-var-derived', planFlow);
  assert.equal(projectOnly(shellExec('pwsh', warnCwd, "$d='src'; Set-Content \"$d/x.ts\" '1'")), undefined);
  const last = readAudit(warnCwd).at(-1);
  assert.equal(last.event, 'guard_shell_unresolved');
  assert.equal(last.decision, 'warn');
  assert.equal(last.reason, 'shell-undecidable');
  assert.equal(last.kind, 'undecidable');
  assert.equal(last.cwdSource, 'agent-session');
  assert.equal(typeof last.command, 'string');
  assert.ok(last.command.length <= 200);
  assert.match(String(last.command), /Set-Content/);
});

check('D-126-02：审计带 cwdSource + command（command 截断 ≤200）', () => {
  const cwd = project('shell-audit-truncate', planFlow);
  const longCommand = `Set-Content src/x.ts '${'a'.repeat(400)}'`;
  assert.equal(projectOnly(shellExec('bash', cwd, 'git status')), undefined);
  const allowRow = readAudit(cwd).at(-1);
  assert.equal(allowRow.cwdSource, 'agent-session');
  assert.equal(typeof allowRow.command, 'string');
  assert.equal(typeof projectOnly(shellExec('pwsh', cwd, longCommand)), 'string');
  const denied = readAudit(cwd).at(-1);
  assert.equal(denied.decision, 'deny');
  assert.equal(denied.cwdSource, 'agent-session');
  assert.ok(denied.command.length <= 200, `command 未截断: ${denied.command.length}`);
  assert.ok(denied.command.endsWith('…'));
});

check('D-126-02：workdir 基准（baseDir = resolve(guardCwd, workdir)）', () => {
  const cwd = project('shell-workdir', planFlow);
  // sub 下写 ../src/a.ts → 解析到 <ws>/src/a.ts → 按相位拒
  assert.match(String(projectOnly(shellExec('bash', cwd, 'echo x > ../src/a.ts', 'sub'))), /不能修改源码\/文档/);
  // sub 下写 ../docs/x.md → 解析到 <ws>/docs/x.md → 文档豁免放行
  assert.equal(projectOnly(shellExec('bash', cwd, 'echo x > ../docs/x.md', 'sub')), undefined);
  // 相对路径按 workdir 解析（审计 paths 可直接验证）
  assert.equal(typeof projectOnly(shellExec('bash', cwd, 'echo x > ./tmp/a.ts', 'sub')), 'string');
  const last = readAudit(cwd).at(-1);
  assert.match(String(last.paths[0]), /sub[\\/]tmp[\\/]a\.ts$/);
});

check('D-126-02：OPENFEEL_SHELL_GATE=default（未设）= 1/2 类拒 + 4 类告警', () => {
  const cwd = project('shell-gate-default', planFlow);
  assert.equal(typeof projectOnly(shellExec('pwsh', cwd, "Set-Content src/x.ts '1'")), 'string');
  assert.equal(projectOnly(shellExec('pwsh', cwd, "Set-Content $env:TEMP\\x.ts '1'")), undefined);
  assert.equal(readAudit(cwd).at(-1).event, 'guard_shell_unresolved');
});

check('D-126-02：OPENFEEL_SHELL_GATE=strict → 第 4 类也拒', () => {
  const cwd = project('shell-gate-strict', planFlow);
  const strict = guardWithShellGate('strict');
  assert.match(String(strict(shellExec('pwsh', cwd, "$d='src'; Set-Content \"$d/x.ts\" '1'"))), /无法静态判定|strict/);
  assert.equal(readAudit(cwd).at(-1).decision, 'deny');
});

check('D-126-02：OPENFEEL_SHELL_GATE=warn → 1/2 类降级为告警放行（审计留痕）', () => {
  const cwd = project('shell-gate-warn', planFlow);
  const warn = guardWithShellGate('warn');
  assert.equal(warn(shellExec('pwsh', cwd, "Set-Content src/x.ts '1'")), undefined);
  const last = readAudit(cwd).at(-1);
  assert.equal(last.event, 'guard_shell_downgraded');
  assert.equal(last.decision, 'warn');
  assert.equal(last.reason, 'phase');
});

check('D-126-02：OPENFEEL_SHELL_GATE=off → 完全不解析 shell，但 write/edit 仍受门禁', () => {
  const cwd = project('shell-gate-off', planFlow);
  const offShell = guardWithShellGate('off');
  assert.equal(offShell(shellExec('pwsh', cwd, "Set-Content src/x.ts '1'")), undefined);
  assert.equal(offShell(shellExec('pwsh', cwd, 'openfeel flow advance --stage x')), undefined);
  assert.equal(existsSync(join(cwd, '.openfeel', 'log', 'guard-audit.jsonl')), false);
  // 文件工具分支不受影响
  assert.match(String(offShell(execution('write', cwd, { path: 'src/x.ts' }))), /exec_running/);
});

check('D-126-02：环境变量优先于 profile 的 shellGate 配置', () => {
  const cwd = project('shell-gate-env', planFlow);
  const previous = process.env.OPENFEEL_SHELL_GATE;
  process.env.OPENFEEL_SHELL_GATE = 'strict';
  try {
    const guard = createOpenFeelGuard({ enforce: 'project', language: 'zh-CN', shellGate: 'off' });
    assert.match(String(guard(shellExec('pwsh', cwd, "$d='src'; Set-Content \"$d/x.ts\" '1'"))), /无法静态判定/);
  } finally {
    if (previous === undefined) delete process.env.OPENFEEL_SHELL_GATE;
    else process.env.OPENFEEL_SHELL_GATE = previous;
  }
});

check('D-126-02：exec_running 下 shell 写源码放行（与文件工具同面）', () => {
  const cwd = project('shell-exec-allow', execFlow);
  for (const command of ["Set-Content src/x.ts '1'", 'echo x > src/x.ts', "$f='src/x.ts'; Set-Content $f '1'"]) {
    assert.equal(projectOnly(shellExec('pwsh', cwd, command)), undefined, command);
  }
});

check('D-126-02：只读 shell 用法不误杀（Get-Content / ls / cat / 输出到 /dev/null）', () => {
  const cwd = project('shell-readonly', planFlow);
  for (const [tool, command] of [
    ['pwsh', 'Get-Content .openfeel/flow.json'],
    ['bash', 'ls -la src'],
    ['bash', 'cat package.json'],
    ['pwsh', 'Get-ChildItem src'],
    ['bash', 'echo "Set-Content src/x.ts" > /dev/null'],
  ]) {
    assert.equal(projectOnly(shellExec(tool, cwd, command)), undefined, `${tool}: ${command}`);
  }
});

// ── op-003：cwd 六环 + 可观测（D-126-01 / D-126-04） ───────────────────

/** 临时设置/清除 `OPENFEEL_GUARD_CWD`（避免本机环境干扰）。 */
function withGuardEnv(value, fn) {
  const previous = process.env.OPENFEEL_GUARD_CWD;
  if (value === undefined) delete process.env.OPENFEEL_GUARD_CWD;
  else process.env.OPENFEEL_GUARD_CWD = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.OPENFEEL_GUARD_CWD;
    else process.env.OPENFEEL_GUARD_CWD = previous;
  }
}

check('D-126-01 第 0 环：OPENFEEL_GUARD_CWD 最高优先级（cwdSource=env、degraded）', () => {
  const planCwd = project('cwd-env-plan', planFlow);
  const envCwd = project('cwd-env-target', planFlow);
  withGuardEnv(envCwd, () => {
    clearGuardCache();
    const resolution = resolveGuardCwd(execution('write', planCwd, { path: 'src/x.ts' }), {});
    assert.equal(resolution.cwd, envCwd);
    assert.equal(resolution.source, 'env');
    assert.equal(resolution.degraded, true);
    // 判定按 env 目录（plan_review）→ 源码拒、文档放行并写审计（cwdSource=env）
    assert.match(String(projectOnly(execution('write', planCwd, { path: 'src/x.ts' }))), /exec_running/);
    assert.equal(projectOnly(execution('write', planCwd, { path: 'docs/x.md' })), undefined);
    assert.equal(readAudit(envCwd).at(-1).cwdSource, 'env');
    const state = readGuardState(envCwd);
    assert.equal(state.cwdSource, 'env');
    assert.equal(state.degraded, true);
  });
});

check('D-126-01 第 1 环：agent.session.header.cwd（cwdSource=agent-session、不降级）', () => {
  const cwd = project('cwd-agent', execFlow);
  const resolution = resolveGuardCwd(execution('write', cwd, { path: 'src/x.ts' }), {});
  assert.equal(resolution.source, 'agent-session');
  assert.equal(resolution.degraded, false);
  assert.equal(projectOnly(execution('write', cwd, { path: 'src/x.ts' })), undefined);
  const state = readGuardState(cwd);
  assert.equal(state.cwdSource, 'agent-session');
  assert.equal(state.degraded, false);
  assert.equal(state.lastDecision.tool, 'write');
  assert.equal(state.lastDecision.decision, 'allow');
});

check('D-126-01 第 2 环：config.cwd（无会话 cwd 时命中，cwdSource=config）', () => {
  const cwd = project('cwd-config', execFlow);
  withGuardEnv(undefined, () => {
    const guard = createOpenFeelGuard({ enforce: 'project', language: 'zh-CN', cwd });
    const exec = { name: 'write', arguments: { path: 'src/x.ts' }, agent: { session: { header: {} } } };
    assert.equal(guard(exec), undefined);
    const state = readGuardState(cwd);
    assert.equal(state.cwdSource, 'config');
    assert.equal(state.degraded, true);
  });
});

check('D-126-01 第 3 环：会话登记表按 sessionId 命中（cwdSource=registry）', () => {
  const cwd = project('cwd-registry', execFlow);
  withGuardEnv(undefined, () => {
    resetCwdRegistry();
    touchCwdSession('sess-registry-1', cwd);
    assert.equal(getSessionCwd('sess-registry-1'), cwd);
    const exec = { name: 'write', arguments: { path: 'src/x.ts' }, agent: { session: { id: 'sess-registry-1', header: {} } } };
    assert.equal(projectOnly(exec), undefined);
    assert.equal(readGuardState(cwd).cwdSource, 'registry');
    // 未知 sessionId → 不命中（没有「进程级最近一次 cwd」兜底）
    assert.equal(getSessionCwd('sess-unknown'), null);
    assert.equal(cwdRegistryModule.lastCwd, undefined, '不允许导出 registry-last 进程级标量');
  });
});

check('D-126-01 第 4 环：process.cwd() 仅当本身含 .openfeel/ 才采用', () => {
  const cwd = project('cwd-process', execFlow);
  const emptyDir = workspace('cwd-process-empty');
  const original = process.cwd();
  withGuardEnv(undefined, () => {
    try {
      process.chdir(cwd);
      clearGuardCache();
      const exec = { name: 'write', arguments: { path: 'src/x.ts' }, agent: { session: { header: {} } } };
      assert.equal(projectOnly(exec), undefined);
      assert.equal(readGuardState(cwd).cwdSource, 'process');
      // 不含 .openfeel/ 的目录**不得**被采用（原 bug 形态）→ fail-closed
      process.chdir(emptyDir);
      clearGuardCache();
      const reason = projectOnly(exec);
      assert.match(String(reason), /fail-closed/);
      assert.equal(resolveGuardCwd(exec, {}).source, 'unresolved');
    } finally {
      process.chdir(original);
      clearGuardCache();
    }
  });
});

check('D-126-01 第 5 环：全链失败 → fail-closed，证据固定落全局（绝不静默）', () => {
  const emptyDir = workspace('cwd-fail-empty');
  const otherCwd = project('cwd-fail-other', execFlow);
  const original = process.cwd();
  withGuardEnv(undefined, () => {
    clearGuardState(null);
    try {
      process.chdir(emptyDir);
      clearGuardCache();
      const exec = { name: 'write', arguments: { path: 'src/x.ts' }, agent: { session: { header: {} } } };
      const reason = projectOnly(exec);
      assert.match(String(reason), /fail-closed/);
      assert.match(String(reason), /cordis\.patch\.yml/);
      assert.match(String(reason), /OPENFEEL_GUARD_CWD/);
      // 全局落点（绝不用 process.cwd()）；v1.5.12 §3-B：路径由隔离 env 决定，不再写字面量
      assert.equal(globalGuardDir(), process.env.OPENFEEL_GUARD_DIR);
      assert.equal(globalGuardStatePath(), join(globalGuardDir(), 'guard-state.json'));
      const state = JSON.parse(readFileSync(globalGuardStatePath(), 'utf-8'));
      assert.equal(state.cwd, null);
      assert.equal(state.cwdSource, 'unresolved');
      assert.equal(state.hostCwd, emptyDir, 'hostCwd 只作诊断字段');
      assert.equal(state.lastDecision.reason, 'cwd-unresolved');
      // 工作区路径没有落点（cwd 不可解析）
      assert.equal(existsSync(join(otherCwd, '.openfeel', 'dev', 'guard-state.json')), false);
      // 审计同样落全局
      assert.ok(existsSync(globalGuardAuditPath()), 'cwd 不可解析时审计必须落全局');
      const lastAudit = JSON.parse(readFileSync(globalGuardAuditPath(), 'utf-8').trim().split('\n').at(-1));
      assert.equal(lastAudit.event, 'guard_deny');
      assert.equal(lastAudit.reason, 'cwd-unresolved');
      assert.equal(lastAudit.cwdSource, 'unresolved');
    } finally {
      process.chdir(original);
      clearGuardCache();
    }
  });
});

check('D-126-01：非 agent-session 来源必出 stderr 告警（不能无声降级）', () => {
  const cwd = project('cwd-warn', execFlow);
  withGuardEnv(undefined, () => {
    const guard = createOpenFeelGuard({ enforce: 'project', language: 'zh-CN', cwd });
    const exec = { name: 'write', arguments: { path: 'src/x.ts' }, agent: { session: { header: {} } } };
    const lines = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk, ...rest) => {
      lines.push(String(chunk));
      return originalWrite.call(process.stderr, chunk, ...rest);
    };
    try {
      assert.equal(guard(exec), undefined);
    } finally {
      process.stderr.write = originalWrite;
    }
    assert.ok(lines.some((line) => line.includes('cwdSource=config')), `缺降级告警：${lines.join('')}`);
  });
});

check('D-126-01：会话登记表上限 64 + LRU 淘汰，空值不入表', () => {
  resetCwdRegistry();
  touchCwdSession('', '/x');
  touchCwdSession('sess-empty', '');
  assert.equal(cwdRegistrySize(), 0);
  for (let index = 0; index < 70; index += 1) touchCwdSession(`sess-${index}`, `/tmp/p${index}`);
  assert.equal(cwdRegistrySize(), CWD_REGISTRY_LIMIT);
  assert.equal(getSessionCwd('sess-0'), null, '最旧的条目应被淘汰');
  assert.equal(getSessionCwd('sess-69'), '/tmp/p69');
  // get 也算使用：sess-6 命中后再插入 1 个不会把它挤掉
  assert.equal(getSessionCwd('sess-6'), '/tmp/p6');
  for (let index = 70; index < 75; index += 1) touchCwdSession(`sess-${index}`, `/tmp/p${index}`);
  assert.equal(getSessionCwd('sess-6'), '/tmp/p6', 'LRU 命中后应保留');
  resetCwdRegistry();
});

check('D-126-04：guard-state 写入/读取（工作区优先，缺失回退全局）', () => {
  const cwd = project('guard-state-read', execFlow);
  const emptyCwd = project('guard-state-read-empty', execFlow);
  clearGuardState(null);
  writeGuardState(cwd, { registered: true, cwd, cwdSource: 'agent-session', degraded: false });
  const workspaceState = readGuardState(cwd);
  assert.equal(workspaceState.source, 'workspace');
  assert.equal(workspaceState.cwd, cwd);
  // 没有工作区文件的项目 → 回退全局（此处全局已被清空 → null）
  assert.equal(readGuardState(emptyCwd), null);
  // 写全局后再读 → global-fallback
  writeGuardState(null, { registered: true, cwd: null, cwdSource: 'unresolved', degraded: true });
  const globalState = readGuardState(emptyCwd);
  assert.equal(globalState.source, 'global-fallback');
  assert.equal(globalState.cwdSource, 'unresolved');
  clearGuardState(null);
  clearGuardState(cwd);
});

check('D-126-04 / stage-127：stale 只认 pid / loaded_hash（hostStartedAt 仅诊断）', () => {
  const cwd = project('guard-state-stale', execFlow);
  clearGuardState(null);
  clearGuardState(cwd);
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const marker = { loaded_hash: 'aaa', started_at: new Date(Date.now() - 120_000).toISOString() };
  try {
    // v4-P2-1：身份来自运行时注册值（不在同一 patch 里又传旧 hostStartedAt，避免自相矛盾）
    setGuardRuntimeIdentity({ pid: process.pid, hostStartedAt: startedAt, loaded_hash: 'aaa' });
    writeGuardState(cwd, {
      registered: true,
      enforce: 'always',
      shellGate: 'default(1/2=deny,4=warn)',
      cwd,
      cwdSource: 'agent-session',
      degraded: false,
    });
    const state = readGuardState(cwd);
    assert.equal(state.hostStartedAt, startedAt, 'hostStartedAt 应由运行时注册值刷新');
    assert.equal(state.pid, process.pid);
    assert.equal(state.loaded_hash, 'aaa');
    const fresh = buildGuardSection({ root: cwd, hostMarker: marker });
    assert.equal(fresh.registered, true);
    assert.equal(fresh.stale, false);
    assert.equal(fresh.signature, 'valid');
    assert.equal(fresh.cwdSource, 'agent-session');
    // loaded_hash 不符 → 适配器已更新但宿主没重启（这条不能放宽）
    assert.equal(computeGuardStale(state, { ...marker, loaded_hash: 'bbb' }), true);
    assert.equal(
      buildGuardSection({ root: cwd, hostMarker: { ...marker, loaded_hash: 'bbb' } }).staleReason,
      'loaded-hash',
    );
    // pid 不符 → 状态来自旧进程
    assert.equal(computeGuardStale(state, marker, process.pid + 1), true);
    // hostStartedAt 早于 marker.started_at 只有诊断意义 → 不再 stale（V13 / P1-3）
    const oldStartValue = new Date(Date.now() - 300_000).toISOString();
    writeGuardState(cwd, { hostStartedAt: oldStartValue, loaded_hash: 'aaa' });
    const oldStart = readGuardState(cwd);
    assert.equal(oldStart.hostStartedAt, oldStartValue);
    assert.equal(computeGuardStale(oldStart, marker), false);
    assert.equal(buildGuardSection({ root: cwd, hostMarker: marker }).stale, false);
    // 局部 patch 只补 loaded_hash：hostStartedAt 仍由注册值刷新
    writeGuardState(cwd, { loaded_hash: 'aaa' });
    assert.equal(readGuardState(cwd).hostStartedAt, startedAt);
  } finally {
    setGuardRuntimeIdentity(null);
    clearGuardState(cwd);
    clearGuardState(null);
  }
  // 两处都缺 → 不假装生效（恰 4 键，P2-2 守门）
  assert.deepEqual(buildGuardSection({ root: cwd }), {
    registered: false, cwd: null, cwdSource: null, stale: false,
  });
});

check('D-126-04：workflowGate 在 guard 未注册 / cwd 不可解析 / stale 时 required', () => {
  const focus = { phase: 'exec_running' };
  const inactive = computeWorkflowGate({ focus, guard: { registered: false } });
  assert.equal(inactive.required, true);
  assert.equal(inactive.reason, 'guard-inactive');
  const unresolved = computeWorkflowGate({ focus, guard: { registered: true, cwd: null, cwdSource: 'unresolved' } });
  assert.equal(unresolved.reason, 'guard-cwd-unresolved');
  assert.match(unresolved.message, /OPENFEEL_GUARD_CWD/);
  const stale = computeWorkflowGate({
    focus,
    guard: { registered: true, cwd: '/x', cwdSource: 'agent-session', stale: true },
  });
  assert.equal(stale.reason, 'guard-stale');
  assert.match(stale.message, /旧进程|旧适配器/);
  // 无 guard 字段 → 零回归
  assert.equal(computeWorkflowGate({ focus }).required, false);
  assert.equal(computeWorkflowGate({ focus: { phase: 'plan_review' } }).required, false);
});

check('D-126-04：每次判定都更新 lastDecision（拒/放/告警三种）', () => {
  const cwd = project('guard-state-lastdecision', planFlow);
  clearGuardState(null);
  assert.equal(typeof projectOnly(execution('write', cwd, { path: 'src/x.ts' })), 'string');
  let state = readGuardState(cwd);
  assert.equal(state.lastDecision.decision, 'deny');
  assert.equal(state.lastDecision.reason, 'phase');
  assert.equal(state.lastDecision.cwdSource, 'agent-session');
  assert.ok(Array.isArray(state.lastDecision.paths));
  assert.equal(projectOnly(execution('write', cwd, { path: 'docs/x.md' })), undefined);
  state = readGuardState(cwd);
  assert.equal(state.lastDecision.decision, 'allow');
  assert.equal(state.lastDecision.reason, 'doc-asset');
  assert.equal(typeof projectOnly(shellExec('pwsh', cwd, "Set-Content $env:TEMP\\x.ts '1'")), 'undefined');
  state = readGuardState(cwd);
  assert.equal(state.lastDecision.decision, 'warn');
  assert.equal(state.lastDecision.reason, 'shell-undecidable');
  assert.equal(typeof state.lastDecision.command, 'string');
  clearGuardState(cwd);
});

// ═══ op-005：门禁绕过修复（独立审查对抗性实测的 12 条绕过）═══════════════════
//
// 每一条都来自审查的**真机实测**，不是假想：P0-1 未识别命令静默放行、P0-2 Win32
// 文件名归一化缺失、P0-3 转移表/配置未受保护、P1-1 openfeel 写检测可绕、P1-2 整树
// git 写覆盖 `.openfeel/**`、P1-3 `git stash` 判只读、P1-4 `archiving` 下 commit 误杀、
// P1-5 间接写 API 表不全、P1-6 guard-state 可伪造。**负向用例就是本次门禁**。

/** 真机 git 仓库（整树写用例）；git 不可用时返回 null（跳过并标注）。 */
function gitProject(name, flow) {
  const dir = project(name, flow);
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore', windowsHide: true });
  try {
    git('-c', 'init.defaultBranch=main', 'init');
    git('config', 'user.email', 'guard-test@example.com');
    git('config', 'user.name', 'guard-test');
    writeFileSync(join(dir, '.gitignore'), '.openfeel/dev/\n.openfeel/log/\n.openfeel/tmp/\n', 'utf8');
    git('add', '-A');
    git('commit', '-m', 'init');
    return { dir, git };
  } catch {
    return null;
  }
}

/** 把文件改成「能让 short name 生效」的外部改动（绕过 guard，模拟其它进程）。 */
function tamperFile(file, mutate) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  mutate(raw);
  writeFileSync(file, JSON.stringify(raw), 'utf8');
}

check('P0-1：未识别命令 → 第 4 类 undecidable（不再是 kind=none 静默放行）', () => {
  const cwd = project('op005-undecidable', planFlow);
  const unknown = 'totally-unknown-tool --flag src/x.ts';
  assert.equal(projectOnly(shellExec('bash', cwd, unknown)), undefined);
  const row = readAudit(cwd).at(-1);
  assert.equal(row.event, 'guard_shell_unresolved');
  assert.equal(row.decision, 'warn');
  assert.equal(row.reason, 'shell-undecidable');
  // 审计 kind 必须能区分「确认只读」（none）与「无法判定」（undecidable）
  assert.equal(row.kind, 'undecidable');
  // 确认只读仍是 none（不误标 undecidable）
  assert.equal(projectOnly(shellExec('bash', cwd, 'ls -la src')), undefined);
  const readonlyRow = readAudit(cwd).at(-1);
  assert.equal(readonlyRow.reason, 'shell-no-write');
  assert.equal(readonlyRow.kind, 'none');
  // strict 档下第 4 类被拒
  const strict = guardWithShellGate('strict');
  assert.match(String(strict(shellExec('bash', cwd, unknown))), /无法静态判定/);
});

check('P0-1：.NET 静态写方法 / New-Object / Add-Type → 第 1 类硬拒', () => {
  const cwd = project('op005-dotnet-write', planFlow);
  for (const [tool, command] of [
    ['pwsh', "[IO.File]::WriteAllText('src/x.ts','1')"],
    ['pwsh', "[System.IO.File]::WriteAllText('src/x.ts','1')"],
    ['pwsh', "[System.IO.Directory]::CreateDirectory('src/gen')"],
    ['pwsh', "New-Object System.IO.StreamWriter('src/x.ts')"],
    ['pwsh', "Add-Type -TypeDefinition 'public class X {}'"],
  ]) {
    assert.match(String(projectOnly(shellExec(tool, cwd, command))), /嵌套解释器|编码执行|无法静态判定/, command);
  }
  // `-AssemblyName` 只是加载程序集 → 不硬拒（落到第 4 类告警）
  assert.equal(projectOnly(shellExec('pwsh', cwd, 'Add-Type -AssemblyName System.Text.Json')), undefined);
});

check('P0-1：下载器 / certutil / robocopy / xcopy 按目标判（源码目标拒）', () => {
  const cwd = project('op005-download-write', planFlow);
  for (const [tool, command] of [
    ['pwsh', 'iwr http://example.com/x -OutFile src/x.ts'],
    ['pwsh', 'Invoke-WebRequest -Uri http://example.com/x -OutFile src/x.ts'],
    ['bash', 'curl.exe -o src/x.ts http://example.com/x'],
    ['bash', 'curl -sSLo src/x.ts http://example.com/x'],
    ['bash', 'wget -O src/x.ts http://example.com/x'],
    ['bash', 'certutil -urlcache -split -f http://example.com/x src/x.ts'],
    ['bash', 'robocopy src dest /MIR'],
    ['bash', 'xcopy src src2 /E'],
  ]) {
    assert.equal(typeof projectOnly(shellExec(tool, cwd, command)), 'string', command);
  }
  // 只读/产物目标不误杀：下载到 stdout、输出到产物目录
  assert.equal(projectOnly(shellExec('bash', cwd, 'curl https://example.com/api')), undefined);
  assert.equal(projectOnly(shellExec('bash', cwd, 'curl -o dist/x.js https://example.com/x.js')), undefined);
  // 文件名来自 URL → 第 4 类告警
  assert.equal(projectOnly(shellExec('bash', cwd, 'wget -qO- https://example.com/x')), undefined);
});

check('P0-1：npx <任意> / node|python <脚本> 不再一刀切放行', () => {
  const cwd = project('op005-script-runner', planFlow);
  for (const [tool, command] of [
    ['bash', 'node scripts/gen.js'],
    ['bash', 'python tools/sync.py'],
    ['bash', 'python3 scripts/seed.py'],
    ['bash', 'npx some-unknown-cli --flag'],
    ['bash', 'npm run deploy'],
  ]) {
    assert.equal(projectOnly(shellExec(tool, cwd, command)), undefined, command);
    const row = readAudit(cwd).at(-1);
    assert.equal(row.kind, 'undecidable', command);
    assert.equal(row.reason, 'shell-undecidable', command);
  }
  // 已知构建/测试命令仍然放行（kind=none）
  for (const command of ['npx vitest run', 'npm run build', 'cargo build --release', 'tsc -b', 'npm install', 'pnpm exec vite build']) {
    assert.equal(projectOnly(shellExec('bash', cwd, command)), undefined, command);
    assert.equal(readAudit(cwd).at(-1).kind, 'none', command);
  }
});

check('P0-1：格式化改写（prettier --write / eslint --fix / gofmt -w）按目标判', () => {
  const cwd = project('op005-formatter-write', planFlow);
  for (const command of ['npx prettier --write src', 'eslint --fix src/x.ts', 'gofmt -w src/x.ts', 'gofmt -lw src/x.ts']) {
    assert.equal(typeof projectOnly(shellExec('bash', cwd, command)), 'string', command);
  }
  // `--check` / `-l` 之外没有写标志的只读用法放行（`grep -i -w` 不误判成写）
  assert.equal(projectOnly(shellExec('bash', cwd, 'prettier --check src')), undefined);
  assert.equal(projectOnly(shellExec('bash', cwd, 'black --check src/x.py')), undefined);
  assert.equal(projectOnly(shellExec('bash', cwd, 'grep -i -w src package.json')), undefined);
});

check('P0-1：`& $var` 调用运算符（可解析→按被调用命令判）/ `$()` 命令替换 → 第 4 类', () => {
  const cwd = project('op005-call-operator', planFlow);
  // 同命令内一次字面量赋值 → 被调用者可知 → 按 `Set-Content src/x.ts` 判（拒）
  assert.equal(typeof projectOnly(shellExec('pwsh', cwd, "$c='Set-Content'; & $c src/x.ts")), 'string');
  // 被调用者不可判定 / 命令替换内层不可解析 → 第 4 类（不静默放行）
  for (const command of ['& $unknownCmd src/x.ts', 'echo $(touch src/x.ts)', 'echo `touch src/x.ts`']) {
    assert.equal(projectOnly(shellExec('pwsh', cwd, command)), undefined, command);
    assert.equal(readAudit(cwd).at(-1).kind, 'undecidable', command);
  }
});

check('P0-2：尾点 / ADS / 大小写等价写法不可绕过（write 路径）', () => {
  if (process.platform !== 'win32') return; // 尾点/ADS 是 Win32 语义
  const cwd = project('op005-win32-names', execFlow);
  for (const path of [
    '.openfeel/flow.json.',
    '.openfeel/flow.json::$DATA',
    '.openfeel/flow.json:stream',
    '.openfeel/flow.json. ',
    '.openfeel/pipeline.yaml.',
  ]) {
    assert.equal(typeof projectOnly(execution('write', cwd, { path })), 'string', path);
  }
});

check('P0-2：8.3 短名不可绕过（realpath 反查；无短名支持则跳过）', () => {
  if (process.platform !== 'win32') return;
  const cwd = project('op005-shortname', execFlow);
  const target = join(cwd, '.openfeel', 'flow.json');
  // 用批处理取短名（`%~sI`），避免把引号直接拼进 cmd /c 的一段参数里。
  const bat = join(cwd, 'shortname.bat');
  writeFileSync(bat, `@echo off\r\nfor %%I in ("${target}") do @echo %%~sI\r\n`, 'utf8');
  let short = null;
  try {
    short = String(execFileSync('cmd', ['/d', '/c', bat], { encoding: 'utf8' })).trim().split(/\r?\n/).pop().trim();
  } catch {
    short = null;
  } finally {
    rmSync(bat, { force: true });
  }
  if (!short || short === '' || short.toLowerCase() === target.toLowerCase()) return; // 短名被关闭 → 跳过
  const relative = short.toLowerCase().startsWith(cwd.toLowerCase()) ? short.slice(cwd.length + 1) : short;
  assert.notEqual(relative.toLowerCase(), join('.openfeel', 'flow.json').toLowerCase());
  assert.equal(typeof projectOnly(execution('write', cwd, { path: relative })), 'string', short);
});

check('P0-2：受保护名归一化同样作用于 shell 路径', () => {
  if (process.platform !== 'win32') return;
  const cwd = project('op005-win32-shell', execFlow);
  for (const command of [
    "Set-Content .openfeel/flow.json. 'x'",
    "Set-Content .openfeel/flow.json::$DATA 'x'",
  ]) {
    assert.match(String(projectOnly(shellExec('pwsh', cwd, command))), /禁止手改|受保护/, command);
  }
});

check('P0-3：受保护文件的「父目录」级写同样拒（rm -rf .openfeel / robocopy / prettier）', () => {
  const cwd = project('op005-protected-ancestor', execFlow);
  for (const [tool, command] of [
    ['bash', 'rm -rf .openfeel'],
    ['pwsh', 'rm -rf .openfeel'],
    ['pwsh', 'Remove-Item -Recurse -Force .openfeel'],
    ['pwsh', 'robocopy src .openfeel /MIR'],
    ['bash', 'xcopy src .openfeel /E'],
    ['bash', 'npx prettier --write .openfeel'],
    ['bash', 'rm -rf .openfeel/dev'],
    ['bash', 'rm -rf .openfeel/log'],
  ]) {
    assert.match(String(projectOnly(shellExec(tool, cwd, command))), /禁止手改|受保护/, `${tool}: ${command}`);
  }
  // `.openfeel/plan/**` 这类流程产物目录仍可写（不整目录保护）
  assert.equal(projectOnly(shellExec('bash', cwd, 'mkdir -p .openfeel/plan/v1/stage-1')), undefined);
});

check('P0-2：盘符冒号不被误当 ADS 截断（绝对路径仍按同一套判定）', () => {
  const cwd = project('op005-drive-letter', planFlow);
  const reason = projectOnly(execution('write', cwd, { path: join(cwd, 'src', 'x.ts') }));
  assert.match(String(reason), /exec_running/);
  assert.equal(projectOnly(execution('write', cwd, { path: join(cwd, 'docs', 'x.md') })), undefined);
});

check('P0-3：pipeline.yaml / config.yaml / metrics.json 在 exec_running 下仍拒', () => {
  const cwd = project('op005-pipeline-config', execFlow);
  for (const path of ['.openfeel/pipeline.yaml', '.openfeel/config.yaml', '.openfeel/metrics.json']) {
    const reason = projectOnly(execution('write', cwd, { path }));
    assert.equal(typeof reason, 'string', path);
    assert.match(String(reason), /禁止手改|human|人类|规则/, path);
  }
  // shell 路径同判
  assert.match(String(projectOnly(shellExec('pwsh', cwd, "Set-Content .openfeel/pipeline.yaml 'x'"))), /禁止手改|受保护/);
  // 反向：`.openfeel/**` 其它产物仍放行（不整目录保护）
  assert.equal(projectOnly(execution('write', cwd, { path: '.openfeel/log/notes.md' })), undefined);
});

check('P2：dsh/cordis.patch.yml（门禁开关）纳入受保护', () => {
  const cwd = project('op005-adapter-config', execFlow);
  const reason = projectOnly(execution('write', cwd, { path: 'dsh/cordis.patch.yml' }));
  assert.equal(typeof reason, 'string');
  assert.match(String(reason), /门禁|gate|人类|human/);
  assert.match(String(projectOnly(shellExec('bash', cwd, "echo x > dsh/cordis.patch.yml"))), /禁止手改|受保护/);
  // 同目录其它文件不受影响
  assert.equal(projectOnly(execution('write', cwd, { path: 'dsh/ADAPTER.md' })), undefined);
});

check('P1-1：openfeel 写命令的引号 / node cli / Start-Process / chore+--source 写法都拒', () => {
  const cwd = project('op005-openfeel-write', planFlow);
  for (const [tool, command] of [
    ['bash', '& "openfeel" chore --source x'],
    ['bash', "'openfeel' chore --source x"],
    ['bash', 'node bin/openfeel.js chore --source x'],
    ['bash', 'node ./dist/cli.js flow advance --stage x'],
    ['pwsh', "Start-Process openfeel -ArgumentList 'chore --source x'"],
  ]) {
    assert.match(String(projectOnly(shellExec(tool, cwd, command))), /禁止用 shell 跑 openfeel 写命令/, command);
  }
  // 只读子命令不误杀
  for (const [tool, command] of [
    ['bash', "'openfeel' flow status"],
    ['bash', 'node bin/openfeel.js flow status'],
    ['pwsh', "Start-Process openfeel -ArgumentList 'flow status'"],
  ]) {
    assert.equal(projectOnly(shellExec(tool, cwd, command)), undefined, command);
  }
});

check('P1-2：整树 git 写在 `.openfeel/**` 有未提交差异时拒（exec_running 也拒）', () => {
  const repo = gitProject('op005-whole-tree-dirty', execFlow);
  if (repo === null) return; // 无 git → 跳过
  const { dir, git } = repo;
  // 干净工作区：整树写放行
  assert.equal(projectOnly(shellExec('bash', dir, 'git checkout -- .')), undefined);
  // 直接改 `.openfeel/flow.json`（模拟 CLI/其它进程写入）→ 整树写会覆盖流程状态 → 拒
  tamperFile(join(dir, '.openfeel', 'flow.json'), (raw) => { raw.__dirty = true; });
  clearGuardCache();
  for (const command of ['git checkout -- .', 'git reset --hard', 'git stash pop', 'git clean -fdx']) {
    assert.equal(typeof projectOnly(shellExec('bash', dir, command)), 'string', command);
  }
  assert.match(String(projectOnly(shellExec('bash', dir, 'git reset --hard'))), /未提交的改动|commit/);
  // 提交后恢复干净 → 放行
  git('add', '-A');
  git('commit', '-m', 'state change');
  assert.equal(projectOnly(shellExec('bash', dir, 'git checkout -- .')), undefined);
});

check('P1-3：`git stash`（push / 无 action）判整树写，`list`/`show` 仍只读', () => {
  const planCwd = project('op005-git-stash', planFlow);
  for (const command of ['git stash', 'git stash push -m x', 'git stash drop']) {
    assert.equal(typeof projectOnly(shellExec('bash', planCwd, command)), 'string', command);
    assert.match(String(projectOnly(shellExec('bash', planCwd, command))), /git 工作区写/, command);
  }
  for (const command of ['git stash list', 'git stash show']) {
    assert.equal(projectOnly(shellExec('bash', planCwd, command)), undefined, command);
  }
});

check('P1-4：`git commit` 在 archiving 放行、在 done / plan_review 拒', () => {
  const archiving = project('op005-commit-archiving', { stages: { 'v1-stage-1': { phase: 'archiving' } }, requirements: [] });
  assert.equal(projectOnly(shellExec('bash', archiving, 'git commit -m "release"')), undefined);
  const done = project('op005-commit-done', noStageFlow);
  assert.equal(typeof projectOnly(shellExec('bash', done, 'git commit -m "release"')), 'string');
  // 其它整树写在 archiving 仍拒（只给 commit 开口，不是整类放开）
  assert.equal(typeof projectOnly(shellExec('bash', archiving, 'git reset --hard')), 'string');
  // `commit` 不覆盖工作区 → 不受「`.openfeel/**` 必须干净」限制（否则修复动作本身被拒）
  const repo = gitProject('op005-commit-dirty', { stages: { 'v1-stage-1': { phase: 'archiving' } }, requirements: [] });
  if (repo === null) return;
  tamperFile(join(repo.dir, '.openfeel', 'flow.json'), (raw) => { raw.__dirty = true; });
  clearGuardCache();
  assert.equal(projectOnly(shellExec('bash', repo.dir, 'git commit -m "release"')), undefined);
  assert.equal(typeof projectOnly(shellExec('bash', repo.dir, 'git reset --hard')), 'string');
});

// ── v1.5.13 / stage-128（REQ-021）：`git commit` 允许相位扩到 review_passed / test_passed ──
//
// 口径：**只放宽 commit**。写侧相位（`decideForTargets`）与 `checkout` / `reset --hard` /
// `stash` / `clean` 一律不动。负例夹具**必须**带 `src/**` 待提交（计划 R2）：若只有
// `.openfeel/**` 差异，`done` 会被 v1.5.12 op-002 的纯书账窄口以 `git-commit-bookkeeping`
// 放行 → 负例假绿。

check('stage-128：`git commit` 允许相位=exec_running/review_passed/test_passed/archiving（4 正 / 7 负）', () => {
  const repo = gitProject('stage128-commit-phase', execFlow);
  if (repo === null) return; // 无 git → 跳过
  const { dir } = repo;
  // 夹具：真实 `src/**` 待提交改动 —— 让「相位」成为负例的唯一变量（R2 防假绿）。
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'pending.ts'), 'pending', 'utf8');
  const setPhase = (phase) => {
    writeFileSync(
      join(dir, '.openfeel', 'flow.json'),
      JSON.stringify({ stages: { 'v1-stage-1': { phase } }, requirements: [] }),
      'utf8',
    );
    clearGuardCache();
  };
  const commit = 'git commit -m "stage-128"';

  // 4 正例：全部放行，且 reason **等值** `git-worktree-write`（走相位门，不是书账窄口）
  for (const phase of ['exec_running', 'review_passed', 'test_passed', 'archiving']) {
    setPhase(phase);
    assert.equal(projectOnly(shellExec('bash', dir, commit)), undefined, phase);
    assert.equal(readAudit(dir).at(-1).reason, 'git-worktree-write', phase);
  }

  // 7 负例：全部 DENY，且 reason **精确值** `shell-git-whole-tree`（绝不走书账放行）
  for (const phase of ['plan_pending', 'plan_review', 'review_pending', 'review_failed', 'test_pending', 'test_failed', 'done']) {
    setPhase(phase);
    const denied = projectOnly(shellExec('bash', dir, commit));
    assert.equal(typeof denied, 'string', phase);
    assert.equal(readAudit(dir).at(-1).reason, 'shell-git-whole-tree', phase);
    // 文案：commit 分叉 → 保留「git 工作区写」+ 相位串从 classification.phases 派生
    assert.match(String(denied), /git 工作区写/, phase);
    assert.match(String(denied), /exec_running \/ review_passed \/ test_passed \/ archiving/, phase);
    // done 的可操作指引：走归档提交
    if (phase === 'done') assert.match(String(denied), /归档提交/, phase);
  }
});

check('stage-128：只改 `.openfeel/**` 时 review_passed 走相位直放、done 仍走书账窄口（窄口零改动）', () => {
  // ① review_passed：相位已放宽 → 直接放行，**不再**需要书账窄口
  const review = gitProject('stage128-bookkeeping-review', { stages: { 'v1-stage-1': { phase: 'review_passed' } }, requirements: [] });
  if (review === null) return;
  tamperFile(join(review.dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  assert.equal(projectOnly(shellExec('bash', review.dir, 'git commit -m x')), undefined);
  assert.equal(readAudit(review.dir).at(-1).reason, 'git-worktree-write');

  // ② done：相位仍不放行 → 仍走 op-002 纯书账窄口（`git-commit-bookkeeping`），本次不改它
  const done = gitProject('stage128-bookkeeping-done', noStageFlow);
  tamperFile(join(done.dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  assert.equal(projectOnly(shellExec('bash', done.dir, 'git commit -m x')), undefined);
  assert.equal(readAudit(done.dir).at(-1).reason, 'git-commit-bookkeeping');
});

check('stage-128：review_passed 只放宽 commit —— write 工具与 checkout/reset/stash/clean 仍拒', () => {
  const reviewFlow = { stages: { 'v1-stage-1': { phase: 'review_passed' } }, requirements: [] };
  const cwd = project('stage128-write-lock', reviewFlow);
  // 文件工具：写侧相位门槛仍只认 exec_running（审完不能再生新改动）
  const writeReason = projectOnly(execution('write', cwd, { path: 'src/a.ts' }));
  assert.equal(typeof writeReason, 'string');
  assert.match(String(writeReason), /exec_running/);
  assert.equal(readGuardState(cwd).lastDecision.reason, 'phase');
  // shell 目标写：`git checkout -- src` 走 decideForTargets，同样拒
  const checkoutReason = projectOnly(shellExec('bash', cwd, 'git checkout -- src'));
  assert.equal(typeof checkoutReason, 'string');
  assert.equal(readAudit(cwd).at(-1).reason, 'phase');
  // 整树写：别的子命令不跟着放宽；非 commit 通用文案保留「git 工作区写」与 advance 指引
  for (const command of ['git reset --hard', 'git stash push -m x', 'git clean -fd']) {
    const denied = projectOnly(shellExec('bash', cwd, command));
    assert.equal(typeof denied, 'string', command);
    assert.equal(readAudit(cwd).at(-1).reason, 'shell-git-whole-tree', command);
    assert.match(String(denied), /git 工作区写/, command);
    assert.match(String(denied), /推进到 exec_running/, command);
  }
});

check('P1-5：间接写 API（child_process / pathlib / urlretrieve / os.system / subprocess）→ 第 1 类', () => {
  const cwd = project('op005-indirect-api', planFlow);
  for (const command of [
    'node -e "require(\'child_process\').execSync(\'openfeel chore --source x\')"',
    'node -e "require(\'child_process\').execFileSync(\'x\')"',
    'node -e "require(\'child_process\').spawnSync(\'x\')"',
    'python -c "import pathlib; pathlib.Path(\'src/x.ts\').write_text(\'1\')"',
    'python -c "from urllib.request import urlretrieve; urlretrieve(\'u\',\'src/x.ts\')"',
    'python -c "import os; os.system(\'touch src/x.ts\')"',
    'python -c "import subprocess; subprocess.run([\'x\'])"',
  ]) {
    assert.match(String(projectOnly(shellExec('bash', cwd, command))), /嵌套解释器|编码执行/, command);
  }
  // 纯只读诊断仍放行（不误杀日常读 JSON）
  assert.equal(projectOnly(shellExec('bash', cwd, 'node -e "console.log(1)"')), undefined);
});

check('P1-6 / stage-127：缺 pid → stale；HMAC 失配 → hmacWarn（不 stale、不掩盖 loaded_hash）', () => {
  const cwd = project('op005-guard-state-tamper', execFlow);
  const file = join(cwd, '.openfeel', 'dev', 'guard-state.json');
  clearGuardState(null);
  clearGuardState(cwd);
  try {
    setGuardRuntimeIdentity(null);
    // 缺 pid → stale（fail-closed；HMAC 失配不再参与，故无 hmacWarn）
    writeGuardState(cwd, { registered: true, cwd, cwdSource: 'agent-session', degraded: false });
    const noPid = buildGuardSection({ root: cwd });
    assert.equal(noPid.stale, true);
    assert.equal(noPid.staleReason, 'pid-missing');
    assert.equal(noPid.hmacWarn, undefined);
    // 正常写入（同一进程签名）→ 不 stale、signature valid、无 hmacWarn
    writeGuardState(cwd, {
      registered: true,
      cwd,
      cwdSource: 'agent-session',
      degraded: false,
      pid: process.pid,
      loaded_hash: 'aaa',
      hostStartedAt: new Date().toISOString(),
    });
    const healthy = buildGuardSection({ root: cwd, hostMarker: { loaded_hash: 'aaa' } });
    assert.equal(healthy.stale, false);
    assert.equal(healthy.signature, 'valid');
    assert.equal(healthy.hmacWarn, undefined);
    // 直接改文件（模拟 agent 用写通道整体重写）→ 签名失配：降级为可见告警，不 stale
    tamperFile(file, (raw) => { raw.lastDecision = { decision: 'allow', reason: 'internal' }; });
    const tampered = buildGuardSection({ root: cwd, hostMarker: { loaded_hash: 'aaa' } });
    assert.equal(tampered.stale, false);
    assert.equal(tampered.hmacWarn, true);
    assert.equal(tampered.signature, 'mismatch');
    assert.equal(tampered.staleReason, undefined);
    // 反控：同样验签失败但 loaded_hash 不符 → stale，不被 hmacWarn 掩盖
    const hashStale = buildGuardSection({ root: cwd, hostMarker: { loaded_hash: 'bbb' } });
    assert.equal(hashStale.stale, true);
    assert.equal(hashStale.staleReason, 'loaded-hash');
    assert.equal(hashStale.hmacWarn, undefined);
    // 伪造 hmac 字段：签名仍失配 → hmacWarn
    tamperFile(file, (raw) => { raw.hmac = 'deadbeef'.repeat(8); });
    assert.equal(buildGuardSection({ root: cwd, hostMarker: { loaded_hash: 'aaa' } }).hmacWarn, true);
  } finally {
    setGuardRuntimeIdentity(null);
    clearGuardState(cwd);
    clearGuardState(null);
  }
});

/* ── stage-127 / op-001：身份自证（G1~G5）+ 受支持自愈（§3-F）─────────────── */

/** 写隔离目录里的宿主 marker（测试用；内容由用例指定）。 */
function writeTestMarker(marker) {
  const path = defaultMarkerPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ adapter: 'dsh', version: 'test', ...marker }, null, 2)}\n`, 'utf8');
  // marker 变了 → 清缓存/节流/审计上限，避免用例之间串味
  resetGuardSelfHealState();
}

/** 直接写一个「旧身份/未签名」的 state 文件（模拟上一轮宿主留下的残留）。 */
function writeRawGuardState(cwd, state) {
  const file = guardStatePath(cwd);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

check('G1/G2：旧工作区身份绝不继承；运行时身份 + 全局注册段胜出（根因①）', () => {
  const cwd = project('guard-identity-refresh', execFlow);
  const marker = { started_at: new Date().toISOString(), loaded_hash: 'hash-current' };
  try {
    clearGuardState(cwd);
    clearGuardState(null);
    // 上一轮宿主留下的工作区 state：旧身份 + 旧 lastDecision
    writeRawGuardState(cwd, {
      registered: true,
      hostStartedAt: '2020-01-01T00:00:00.000Z',
      loaded_hash: 'hash-old',
      pid: process.pid + 1,
      cwd,
      cwdSource: 'config',
      lastDecision: { at: 'old', tool: 'write', decision: 'deny', reason: 'phase' },
    });
    setGuardRuntimeIdentity({ pid: process.pid, hostStartedAt: marker.started_at, loaded_hash: marker.loaded_hash });
    // 启动期 cwd 未解析 → 全局注册段（当前身份）
    writeGuardState(null, { registered: true, shellGate: 'default(1/2=deny,4=warn)' });
    // 工作区首次判定：不带任何身份字段
    writeGuardState(cwd, {
      cwd,
      cwdSource: 'agent-session',
      lastDecision: { at: 'new', tool: 'write', decision: 'deny', reason: 'phase' },
    });
    const state = readGuardState(cwd);
    assert.equal(state.hostStartedAt, marker.started_at, '旧 hostStartedAt 不得覆盖当前身份');
    assert.equal(state.pid, process.pid, '旧 pid 不得覆盖当前身份');
    assert.equal(state.loaded_hash, marker.loaded_hash, '旧 loaded_hash 不得覆盖当前身份');
    assert.equal(state.lastDecision.at, 'new', 'lastDecision 等易变字段仍应继承/覆盖');
    assert.equal(state.cwdSource, 'agent-session');
    assert.equal(computeGuardStale(state, marker), false);
  } finally {
    setGuardRuntimeIdentity(null);
    clearGuardState(cwd);
    clearGuardState(null);
  }
});

check('G2：runtimeIdentity 为空时用全局注册段兜底（弱兜底），旧工作区身份仍剥离', () => {
  const cwd = project('guard-identity-seed', execFlow);
  const marker = { started_at: new Date().toISOString(), loaded_hash: 'hash-global' };
  try {
    setGuardRuntimeIdentity(null);
    clearGuardState(cwd);
    clearGuardState(null);
    writeGuardState(null, {
      registered: true,
      hostStartedAt: marker.started_at,
      loaded_hash: marker.loaded_hash,
      pid: process.pid,
    });
    writeRawGuardState(cwd, {
      registered: true,
      hostStartedAt: '2019-01-01T00:00:00.000Z',
      loaded_hash: 'hash-stale',
      pid: process.pid + 2,
      cwd,
      cwdSource: 'config',
    });
    writeGuardState(cwd, { cwd, cwdSource: 'agent-session' });
    const state = readGuardState(cwd);
    assert.equal(state.hostStartedAt, marker.started_at, '全局注册段应作为弱兜底');
    assert.equal(state.pid, process.pid);
    assert.equal(state.loaded_hash, 'hash-global');
    assert.equal(state.cwdSource, 'agent-session');
    assert.equal(computeGuardStale(state, marker), false);
  } finally {
    setGuardRuntimeIdentity(null);
    clearGuardState(cwd);
    clearGuardState(null);
  }
});

check('F：repairGuardState 保留易变字段、写审计、重复调用幂等', () => {
  const cwd = project('guard-repair', execFlow);
  const marker = { started_at: new Date().toISOString(), loaded_hash: 'hash-new' };
  const lastDecision = { at: '2026-01-01T00:00:00.000Z', tool: 'write', decision: 'deny', reason: 'phase' };
  try {
    setGuardRuntimeIdentity(null);
    writeTestMarker(marker);
    clearGuardState(null);
    writeRawGuardState(cwd, {
      registered: true,
      cwd: 'C:/previous',
      cwdSource: 'agent-session',
      hostStartedAt: '2020-01-01T00:00:00.000Z',
      loaded_hash: 'hash-old',
      pid: process.pid + 1,
      lastDecision,
    });
    const first = repairGuardState(cwd, { hostMarker: marker });
    assert.equal(first.ok, true);
    assert.equal(first.changed, true);
    const state = readGuardState(cwd);
    assert.equal(state.pid, process.pid);
    assert.equal(state.loaded_hash, 'hash-new');
    assert.equal(state.hostStartedAt, marker.started_at);
    assert.deepEqual(state.lastDecision, lastDecision, 'lastDecision 应逐字段保留');
    assert.equal(state.cwd, 'C:/previous', 'cwd 应保留');
    assert.equal(state.cwdSource, 'agent-session', 'cwdSource 应保留');
    assert.equal(computeGuardStale(state, marker), false);
    const auditLines = readFileSync(guardAuditPath(cwd), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const last = auditLines.at(-1);
    assert.equal(last.event, 'guard_repair');
    assert.equal(last.auto, false);
    assert.equal(last.old.pid, process.pid + 1);
    assert.equal(last.old.loaded_hash, 'hash-old');
    assert.equal(last.new.pid, process.pid);
    assert.equal(last.new.loaded_hash, 'hash-new');
    // 幂等：不写盘、不审计
    const second = repairGuardState(cwd, { hostMarker: marker });
    assert.equal(second.ok, true);
    assert.equal(second.changed, false);
    assert.equal(readFileSync(guardAuditPath(cwd), 'utf8').trim().split('\n').length, auditLines.length);
  } finally {
    setGuardRuntimeIdentity(null);
    clearGuardState(cwd);
  }
});

check('F：repairGuardState marker 缺失 → 明确报错且零写盘', () => {
  const cwd = project('guard-repair-no-marker', execFlow);
  try {
    setGuardRuntimeIdentity(null);
    clearGuardState(null);
    writeRawGuardState(cwd, { registered: true, hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: process.pid + 1 });
    rmSync(defaultMarkerPath(), { force: true });
    const before = readFileSync(guardStatePath(cwd), 'utf8');
    const result = repairGuardState(cwd, { hostMarker: null });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'marker-missing');
    assert.equal(readFileSync(guardStatePath(cwd), 'utf8'), before, 'marker 缺失时必须零写盘');
    assert.equal(existsSync(guardAuditPath(cwd)), false, 'marker 缺失时不得写审计');
  } finally {
    clearGuardState(cwd);
  }
});

check('F：state 为 null + marker 存在 → repair 写出可信 state', () => {
  const cwd = project('guard-repair-null-state', execFlow);
  const marker = { started_at: new Date().toISOString(), loaded_hash: 'hash-new' };
  try {
    setGuardRuntimeIdentity(null);
    writeTestMarker(marker);
    clearGuardState(null);
    clearGuardState(cwd);
    const result = repairGuardState(cwd, { hostMarker: marker });
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    const state = readGuardState(cwd);
    assert.equal(state.registered, true);
    assert.equal(state.cwd, cwd);
    assert.equal(state.cwdSource, 'repair');
    assert.equal(state.pid, process.pid);
    assert.equal(computeGuardStale(state, marker), false);
  } finally {
    setGuardRuntimeIdentity(null);
    clearGuardState(cwd);
    clearGuardState(null);
  }
});

check('F：自动自愈 — 死 pid 修复 / 活异 pid 跳过 / OPENFEEL_GUARD_SELF_HEAL=off', () => {
  const marker = { started_at: new Date().toISOString(), loaded_hash: 'hash-new' };
  writeTestMarker(marker);
  // 死 pid（上一轮宿主残留）→ 自动修
  const deadRoot = project('guard-selfheal-dead', execFlow);
  writeRawGuardState(deadRoot, {
    registered: true, cwd: deadRoot, cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: 2147483647,
  });
  const healed = maybeSelfHealGuardState(deadRoot);
  assert.equal(healed.checked, true);
  assert.equal(healed.healed, true);
  const deadState = readGuardState(deadRoot);
  assert.equal(deadState.pid, process.pid);
  assert.equal(deadState.loaded_hash, 'hash-new');
  assert.equal(computeGuardStale(deadState, marker), false);
  // 活着的异 pid → 跳过（显式入口才修）
  const aliveRoot = project('guard-selfheal-alive', execFlow);
  const alivePid = process.ppid;
  assert.ok(Number.isFinite(alivePid) && alivePid !== process.pid, '需要可用的父进程 pid 做存活性断言');
  writeRawGuardState(aliveRoot, {
    registered: true, cwd: aliveRoot, cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: alivePid,
  });
  const aliveBefore = readFileSync(guardStatePath(aliveRoot), 'utf8');
  const skipped = maybeSelfHealGuardState(aliveRoot);
  assert.equal(skipped.healed, false);
  assert.equal(skipped.reason, 'foreign-pid-alive');
  assert.equal(readFileSync(guardStatePath(aliveRoot), 'utf8'), aliveBefore, '活着的异 pid 不得自动改写');
  // 逃生阀
  const offRoot = project('guard-selfheal-off', execFlow);
  writeRawGuardState(offRoot, {
    registered: true, cwd: offRoot, cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: 2147483647,
  });
  const offBefore = readFileSync(guardStatePath(offRoot), 'utf8');
  process.env.OPENFEEL_GUARD_SELF_HEAL = 'off';
  try {
    const disabled = maybeSelfHealGuardState(offRoot);
    assert.equal(disabled.checked, false);
    assert.equal(disabled.reason, 'disabled');
  } finally {
    delete process.env.OPENFEEL_GUARD_SELF_HEAL;
  }
  assert.equal(readFileSync(guardStatePath(offRoot), 'utf8'), offBefore, 'off 时零写盘');
  clearGuardState(deadRoot);
  clearGuardState(aliveRoot);
  clearGuardState(offRoot);
  rmSync(guardAuditPath(deadRoot), { force: true });
  rmSync(guardAuditPath(aliveRoot), { force: true });
  rmSync(guardAuditPath(offRoot), { force: true });
});

check('F：自动自愈 — fresh 不写盘、60s 节流、marker 缓存、单次 ≤2 次同步读', () => {
  const marker = { started_at: new Date().toISOString(), loaded_hash: 'hash-new' };
  writeTestMarker(marker);
  // fresh（pid + hash 一致）→ 不写盘
  const freshRoot = project('guard-selfheal-fresh', execFlow);
  try {
    setGuardRuntimeIdentity({ pid: process.pid, hostStartedAt: marker.started_at, loaded_hash: marker.loaded_hash });
    writeGuardState(freshRoot, { registered: true, cwd: freshRoot, cwdSource: 'agent-session' });
  } finally {
    setGuardRuntimeIdentity(null);
  }
  const freshMtime = statSync(guardStatePath(freshRoot)).mtimeMs;
  const fresh = maybeSelfHealGuardState(freshRoot);
  assert.equal(fresh.healed, false);
  assert.equal(fresh.reason, 'trusted');
  assert.equal(statSync(guardStatePath(freshRoot)).mtimeMs, freshMtime, 'fresh 时不得写盘');
  // 节流：同一 root 60s 内只检查一次
  const throttleRoot = project('guard-selfheal-throttle', execFlow);
  writeRawGuardState(throttleRoot, {
    registered: true, cwd: throttleRoot, cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: 2147483647,
  });
  const throttleFirst = maybeSelfHealGuardState(throttleRoot);
  assert.equal(throttleFirst.healed, true);
  // 再次人为置旧 → 60s 内第二次必须节流（不读、不写）
  writeRawGuardState(throttleRoot, {
    registered: true, cwd: throttleRoot, cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: 2147483647,
  });
  const throttleSecond = maybeSelfHealGuardState(throttleRoot);
  assert.equal(throttleSecond.checked, false);
  assert.equal(throttleSecond.reason, 'throttled');
  assert.equal(readGuardState(throttleRoot).loaded_hash, 'hash-old', '节流期间不得改写');
  // 读次数：单次自动检查 ≤2（state 1 + marker 1）；marker 缓存命中后不再读
  resetGuardSelfHealState();
  const readRootA = project('guard-selfheal-read-a', execFlow);
  writeRawGuardState(readRootA, {
    registered: true, cwd: readRootA, cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: 2147483647,
  });
  const readHealA = maybeSelfHealGuardState(readRootA);
  assert.equal(readHealA.healed, true);
  let stats = readGuardSelfHealStats();
  assert.ok(
    stats.stateReads + stats.markerReads + stats.writeReads <= 4,
    `单次自动检查应 ≤4 次同步读（state 1 + marker 1 + 写盘内部 2），实际 state=${stats.stateReads} marker=${stats.markerReads} write=${stats.writeReads}`,
  );
  assert.equal(stats.markerReads, 1);
  const readRootB = project('guard-selfheal-read-b', execFlow);
  writeRawGuardState(readRootB, {
    registered: true, cwd: readRootB, cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: 2147483647,
  });
  const readHealB = maybeSelfHealGuardState(readRootB);
  assert.equal(readHealB.healed, true);
  stats = readGuardSelfHealStats();
  assert.equal(stats.markerReads, 1, 'marker mtime+size 未变 → 命中缓存、零内容读盘');
  assert.equal(stats.checks, 2);
  clearGuardState(freshRoot);
  clearGuardState(throttleRoot);
  clearGuardState(readRootA);
  clearGuardState(readRootB);
  for (const dir of [freshRoot, throttleRoot, readRootA, readRootB]) rmSync(guardAuditPath(dir), { force: true });
});

check('F：自动自愈的 guard_repair 审计每宿主启动至多 1 条；显式修复按实际变更加 1 条', () => {
  const marker = { started_at: new Date().toISOString(), loaded_hash: 'hash-new' };
  writeTestMarker(marker);
  const rootA = project('guard-selfheal-audit-a', execFlow);
  const rootB = project('guard-selfheal-audit-b', execFlow);
  for (const dir of [rootA, rootB]) {
    writeRawGuardState(dir, {
      registered: true, cwd: dir, cwdSource: 'agent-session',
      hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: 2147483647,
    });
  }
  maybeSelfHealGuardState(rootA);
  maybeSelfHealGuardState(rootB);
  const auditA = readFileSync(guardAuditPath(rootA), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(auditA.filter((record) => record.event === 'guard_repair' && record.auto === true).length, 1);
  // 第二个 root 的自动修复只写 state、不再追加审计
  assert.equal(existsSync(guardAuditPath(rootB)), false, '自动自愈审计每宿主启动至多 1 条');
  // 显式修复：每次实际变更各 1 条；幂等时不写
  const rootC = project('guard-selfheal-audit-c', execFlow);
  writeRawGuardState(rootC, {
    registered: true, cwd: rootC, cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z', loaded_hash: 'hash-old', pid: process.pid + 1,
  });
  repairGuardState(rootC, { hostMarker: marker });
  repairGuardState(rootC, { hostMarker: marker });
  const auditC = readFileSync(guardAuditPath(rootC), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(auditC.filter((record) => record.event === 'guard_repair').length, 1, '幂等时不得新增审计');
  for (const dir of [rootA, rootB, rootC]) {
    clearGuardState(dir);
    rmSync(guardAuditPath(dir), { force: true });
  }
});

check('P2：pwsh 解析器继承 POSIX 写命令集（touch / sed -i）', () => {
  const cwd = project('op005-pwsh-posix', planFlow);
  for (const command of ['touch src/x.ts', "sed -i 's/a/b/' src/x.ts"]) {
    assert.equal(typeof projectOnly(shellExec('pwsh', cwd, command)), 'string', command);
  }
  assert.equal(projectOnly(shellExec('pwsh', cwd, "sed 's/a/b/' src/x.ts")), undefined);
});

// ── op-006：复审剩余 P1/P2（未跟踪文件 / .NET 正向判定 / formatter 只读）──────

check('P1-1：`git clean -fdx` 在 `.openfeel/**` 有未跟踪文件时拒（checkout 不受影响）', () => {
  const repo = gitProject('op006-clean-untracked', execFlow);
  if (repo === null) return; // 无 git → 跳过
  const { dir } = repo;
  // 干净树（无未跟踪文件）：clean 放行
  assert.equal(projectOnly(shellExec('bash', dir, 'git clean -fdx')), undefined);
  // 未跟踪的 `.openfeel/chore.json`（此测试仓库未 ignore 它）→ `clean -fdx` 会删掉 → 拒
  writeFileSync(join(dir, '.openfeel', 'chore.json'), JSON.stringify({ expires_at: '2099-01-01T00:00:00Z' }), 'utf8');
  const denied = projectOnly(shellExec('bash', dir, 'git clean -fdx'));
  assert.equal(typeof denied, 'string');
  assert.match(String(denied), /未提交的改动|commit/);
  // checkout / reset 不动未跟踪文件 → 不因此被误拒
  assert.equal(projectOnly(shellExec('bash', dir, 'git checkout -- .')), undefined);
  assert.equal(projectOnly(shellExec('bash', dir, 'git reset --hard')), undefined);
  // `stash -u` 会收走未跟踪文件 → 拒；`stash`（无 -u）只收 tracked → 放行
  assert.equal(typeof projectOnly(shellExec('bash', dir, 'git stash -u')), 'string');
  assert.equal(projectOnly(shellExec('bash', dir, 'git stash')), undefined);
  // 被 .gitignore 忽略的审计证据：`clean -fdx` 会连它一起删 → 拒；`clean -fd` 不动它 → 放行
  const ignored = gitProject('op006-clean-ignored', execFlow);
  if (ignored === null) return;
  mkdirSync(join(ignored.dir, '.openfeel', 'log'), { recursive: true });
  writeFileSync(join(ignored.dir, '.openfeel', 'log', 'guard-audit.jsonl'), '{"event":"guard_allow"}\n', 'utf8');
  assert.equal(typeof projectOnly(shellExec('bash', ignored.dir, 'git clean -fdx')), 'string');
  assert.equal(projectOnly(shellExec('bash', ignored.dir, 'git clean -fd')), undefined);
});

check('P1-2：.NET 写 API 正面判定（Async / Open(Create) 拒；只读方法放行）', () => {
  const cwd = project('op006-dotnet-positive', planFlow);
  for (const [tool, command] of [
    ['pwsh', "[IO.File]::WriteAllTextAsync('src/x.ts','1')"],
    ['pwsh', "[IO.File]::AppendAllTextAsync('src/x.ts','1')"],
    ['pwsh', "[System.IO.File]::Open('src/x.ts','Create')"],
    ['pwsh', "[IO.File]::Open('src/x.ts','Append')"],
    ['pwsh', "[IO.File]::CreateText('src/x.ts')"],
    ['pwsh', "[IO.Directory]::CreateDirectory('src/gen')"],
    ['pwsh', "[IO.Compression.ZipFile]::ExtractToDirectory('a.zip','src')"],
  ]) {
    assert.match(String(projectOnly(shellExec(tool, cwd, command))), /嵌套解释器|编码执行/, command);
  }
  // 正面判定不误杀日常只读静态调用
  for (const command of [
    "[IO.File]::ReadAllText('package.json')",
    "[IO.File]::Exists('package.json')",
    "[IO.Path]::Combine('a','b')",
    '[Math]::Floor(1.5)',
    "[System.IO.Directory]::GetFiles('src')",
  ]) {
    assert.equal(projectOnly(shellExec('pwsh', cwd, command)), undefined, command);
  }
});

check('P2：formatter 无写标志 = 确认只读（kind=none，strict 档不误拒）', () => {
  const cwd = project('op006-formatter-readonly', planFlow);
  const strict = guardWithShellGate('strict');
  for (const command of ['prettier --check src', 'eslint src', 'gofmt -l src/x.go']) {
    assert.equal(strict(shellExec('bash', cwd, command)), undefined, command);
    assert.equal(readAudit(cwd).at(-1).kind, 'none', command);
  }
});

// ── v1.5.12 / stage-127 op-002：无阶段 `git commit` 只放行单条纯书账 ────────
//
// 对应 plan §3-C（七条件）/ §4 op-002 / 验收 V5·V7·V8·V9。负向用例就是本次门禁：
// 每条都必须 DENY，且审计/lastDecision 的 reason **绝不出现** `git-commit-bookkeeping`。

/** 断言一条命令被拒，且没有走「纯书账」放行分支。 */
function denyBookkeeping(guardFn, dir, command, tool = 'bash', workdir) {
  const result = guardFn(shellExec(tool, dir, command, workdir));
  assert.equal(typeof result, 'string', `应拒绝：${command}`);
  const row = readAudit(dir).at(-1);
  assert.notEqual(row.reason, 'git-commit-bookkeeping', `不得走书账放行：${command}`);
  assert.ok(
    row.reason === 'shell-git-whole-tree' || row.reason === 'shell-indirect-exec',
    `reason=${row.reason}（${command}）`,
  );
  return String(result);
}

/** 纯 `git` 仓库（不含 `.openfeel`），给「非项目工作区」用例。 */
function bareGitRepo(name) {
  const dir = workspace(name);
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore', windowsHide: true });
  try {
    git('-c', 'init.defaultBranch=main', 'init');
    git('config', 'user.email', 'guard-test@example.com');
    git('config', 'user.name', 'guard-test');
    writeFileSync(join(dir, 'x.txt'), '1', 'utf8');
    git('add', '-A');
    git('commit', '-m', 'init');
    return dir;
  } catch {
    return null;
  }
}

check('op-002 / V5：无阶段 + 只有 `.openfeel/**` 差异 → `git commit -m x` 放行且 reason=git-commit-bookkeeping', () => {
  const repo = gitProject('op002-bookkeeping-allow', noStageFlow);
  if (repo === null) return;
  const { dir } = repo;
  // 只改 `.openfeel/**`（tracked），工作区其它路径干净
  tamperFile(join(dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  assert.equal(projectOnly(shellExec('bash', dir, 'git commit -m x')), undefined);
  assert.equal(readAudit(dir).at(-1).reason, 'git-commit-bookkeeping');
  assert.equal(readGuardState(dir).lastDecision.reason, 'git-commit-bookkeeping');
});

check('op-002：有 `exec_running` 阶段 → 照常放行（reason=git-worktree-write，不走书账分支）', () => {
  const repo = gitProject('op002-bookkeeping-exec', execFlow);
  if (repo === null) return;
  assert.equal(projectOnly(shellExec('bash', repo.dir, 'git commit -m x')), undefined);
  assert.equal(readAudit(repo.dir).at(-1).reason, 'git-worktree-write');
});

check('op-002 / V7：多语句 / 管道 / 后台 / 重定向 / 命令替换 / 嵌套 wrapper 一律 DENY', () => {
  const repo = gitProject('op002-bookkeeping-deny', noStageFlow);
  if (repo === null) return;
  const { dir } = repo;
  tamperFile(join(dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  // 组合形态（`splitShellStatements` / 重定向 / 掩码后的裸分隔符）
  for (const command of [
    'git commit -m x && git clean -fdx',
    'git commit -m x; git checkout -- .',
    'git commit -m x | cat',
    'git commit -m x &',
    'git commit -m x > src/x.ts',
  ]) {
    denyBookkeeping(projectOnly, dir, command);
  }
  // 会真执行的替换 payload（双引号内 `$()` 在 bash 里是真替换）
  denyBookkeeping(projectOnly, dir, 'git commit -m "$(rm -rf src)"');
  denyBookkeeping(projectOnly, dir, 'git commit -m "`rm -rf src`"');
  // nested wrapper：内层即使是干净 commit 也不放行
  denyBookkeeping(projectOnly, dir, 'bash -c "git commit -m x; rm -rf src"');
  denyBookkeeping(projectOnly, dir, 'pwsh -Command "git commit -m x; rm -rf src"', 'pwsh');
});

check('op-002 / V8：staged-only（`git add` 后 `git restore -W -s HEAD`）→ DENY 且点名路径', () => {
  const repo = gitProject('op002-bookkeeping-staged', noStageFlow);
  if (repo === null) return;
  const { dir, git } = repo;
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'x.ts'), 'old', 'utf8');
  git('add', '-A');
  git('commit', '-m', 'src baseline');
  writeFileSync(join(dir, 'src', 'x.ts'), 'new', 'utf8');
  git('add', 'src/x.ts');
  git('restore', '-W', '-s', 'HEAD', 'src/x.ts');
  clearGuardCache();
  // worktree 已还原到 HEAD，但 index 仍有改动 —— 只有 porcelain 的 X 位看得见
  const denied = denyBookkeeping(projectOnly, dir, 'git commit -m x');
  assert.match(denied, /src\/x\.ts/);
  assert.match(denied, /\.openfeel\/ 之外的条目/);
});

check('op-002：未跟踪 `src/new.ts` → DENY 且点名（`--untracked-files=all`）', () => {
  const repo = gitProject('op002-bookkeeping-untracked', noStageFlow);
  if (repo === null) return;
  const { dir } = repo;
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'new.ts'), '1', 'utf8');
  clearGuardCache();
  const denied = denyBookkeeping(projectOnly, dir, 'git commit -m x');
  assert.match(denied, /src\/new\.ts/);
});

check('op-002 / C.3 + op-004 P1-2：R/C 条目的新旧路径都参与 offender 判定', () => {
  const repo = gitProject('op002-bookkeeping-rename', noStageFlow);
  if (repo === null) return;
  const { dir, git } = repo;
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.ts'), 'a', 'utf8');
  git('add', '-A');
  git('commit', '-m', 'src a');
  git('mv', 'src/a.ts', 'src/b.ts');
  clearGuardCache();
  const denied = denyBookkeeping(projectOnly, dir, 'git commit -m x');
  // op-004（P1-2）：R/C 条目的**新旧路径都算** offender（旧路径可能正是被搬走的源码）
  assert.match(denied, /src\/a\.ts/);
  assert.match(denied, /src\/b\.ts/);
  // 纯 `.openfeel/**` 的重命名仍是纯书账 → 放行（先把上面的 src 重命名撤回；
  // 注意**不能**重命名 `flow.json`：它是项目标记，移走会让工作区不再是项目）
  git('mv', 'src/b.ts', 'src/a.ts');
  writeFileSync(join(dir, '.openfeel', 'notes.md'), 'n', 'utf8');
  git('add', '.openfeel/notes.md');
  git('commit', '-m', 'notes');
  git('mv', '.openfeel/notes.md', '.openfeel/notes-renamed.md');
  clearGuardCache();
  assert.equal(projectOnly(shellExec('bash', dir, 'git commit -m x')), undefined);
  assert.equal(readAudit(dir).at(-1).reason, 'git-commit-bookkeeping');
});

check('op-002 / V9：`-C` / `-C=` / `--git-dir` / `--work-tree` 的 commit 一律拒且文案说明', () => {
  const repo = gitProject('op002-bookkeeping-repo-override', noStageFlow);
  if (repo === null) return;
  for (const command of [
    'git -C ../other commit -am x',
    'git -C=../other commit -m x',
    'git --git-dir=/x commit -m x',
    'git --work-tree=/x commit -m x',
  ]) {
    const denied = denyBookkeeping(projectOnly, repo.dir, command);
    assert.match(denied, /无法校验仓库归属/, command);
  }
});

check('op-002 / V9 + op-006：`-c` / `--config-env` 分离与附着形式都进入 commit 判定（安全键）', () => {
  const repo = gitProject('op002-bookkeeping-config', execFlow);
  if (repo === null) return;
  for (const command of [
    'git -c user.name=x commit -m y',
    'git -cuser.name=x commit -m y',
    'git -c=user.name=x commit -m y',
    'git --config-env=user.name=CONFIG_ENV_NAME commit -m y',
  ]) {
    assert.equal(projectOnly(shellExec('bash', repo.dir, command)), undefined, command);
    const row = readAudit(repo.dir).at(-1);
    assert.equal(row.reason, 'git-worktree-write', command);
    assert.equal(row.kind, 'whole-tree', command);
  }
});

check('op-002：`classifyShellCommand` 透传 `gitSubcommand` / 保留 `undecidable`（不得回退为 false）', () => {
  const baseDir = workspace('op002-classify');
  const plain = classifyShellCommand({ command: 'git commit -m x', baseDir, shell: 'bash' });
  assert.equal(plain.kind, 'whole-tree');
  assert.equal(plain.gitSubcommand, 'commit');
  assert.equal(plain.repoOverride, false);
  const substituted = classifyShellCommand({ command: 'git commit -m "$(x)"', baseDir, shell: 'bash' });
  assert.equal(substituted.kind, 'whole-tree');
  assert.equal(substituted.undecidable, true);
  const backticked = classifyShellCommand({ command: 'git commit -m "`x`"', baseDir, shell: 'bash' });
  assert.equal(backticked.kind, 'whole-tree');
  assert.equal(backticked.gitSubcommand, 'commit');
  // 引号内分号不拆语句（正向边界，放行侧见下一条用例）
  const semicolon = classifyShellCommand({ command: 'git commit -m "a; b"', baseDir, shell: 'bash' });
  assert.equal(semicolon.kind, 'whole-tree');
  assert.equal(semicolon.undecidable, false);
});

check('op-002：非项目工作区 / `flow.json` 不可读 → 书账放行不成立（fail-closed）', () => {
  // 非项目：只有 `.git`，无 `.openfeel`。`project` 档按设计放行整树写，
  // 所以用 `always` 档观察「书账条件不成立 → 拒绝」。
  const bare = bareGitRepo('op002-bare-repo');
  if (bare !== null) {
    assert.equal(typeof always(shellExec('bash', bare, 'git commit -m x')), 'string');
  }
  // flow.json 坏掉的项目：不能把「flow 读不出」当成「无阶段」
  const broken = gitProject('op002-flow-broken', noStageFlow);
  if (broken === null) return;
  writeFileSync(join(broken.dir, '.openfeel', 'flow.json'), '{ broken', 'utf8');
  clearGuardCache();
  assert.equal(typeof projectOnly(shellExec('bash', broken.dir, 'git commit -m x')), 'string');
});

check('op-002：正向边界 `git commit -m "a; b"` 在书账仓库放行；单引号 `$(…)` 被拒（已知代价）', () => {
  const repo = gitProject('op002-bookkeeping-boundary', noStageFlow);
  if (repo === null) return;
  const { dir } = repo;
  tamperFile(join(dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  assert.equal(projectOnly(shellExec('bash', dir, 'git commit -m "a; b"')), undefined);
  assert.equal(readAudit(dir).at(-1).reason, 'git-commit-bookkeeping');
  // 单引号内的 `$(` 也会被拒：宁可误拒，不可漏检真执行形态
  const knownCost = projectOnly(shellExec('bash', dir, "git commit -m 'fix $(x)'"));
  assert.equal(typeof knownCost, 'string');
  assert.notEqual(readAudit(dir).at(-1).reason, 'git-commit-bookkeeping');
});

// ── v1.5.12 / stage-127 op-004（复审：1 P0 + 4 P1 + 2 P2 的对抗性绕过）───────

check('op-004 P0：进程替换 `<(...)` / `>(...)` 与输入重定向不进书账放行', () => {
  const repo = gitProject('op004-procsub', noStageFlow);
  if (repo === null) return;
  const { dir } = repo;
  tamperFile(join(dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  for (const command of [
    'git commit -m x < <(rm -rf src)',
    'git commit -m x > >(cat)',
    'git commit -m x < src/x.ts',
    'git commit -m x <<< "msg"',
  ]) {
    denyBookkeeping(projectOnly, dir, command);
  }
  // 引号内的 `<(` 是字面量，不误拒
  assert.equal(projectOnly(shellExec('bash', dir, 'git commit -m "a <(b)"')), undefined);
  // `/dev/null` 是空设备：读/写都放行
  assert.equal(projectOnly(shellExec('bash', dir, 'git commit -m x < /dev/null')), undefined);
  assert.equal(projectOnly(shellExec('bash', dir, 'git commit -m x > /dev/null')), undefined);
});

check('op-004 P1-1 / op-006：`-c` / `--config-env` 不进书账分支（不安全的键第 1 类）', () => {
  const repo = gitProject('op004-config', noStageFlow);
  if (repo === null) return;
  const { dir } = repo;
  tamperFile(join(dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  // 非白名单键（hooksPath）→ 第 1 类硬拒，任何相位
  const hooks = denyBookkeeping(projectOnly, dir, 'git -c core.hooksPath=.openfeel/tmp commit -am x');
  assert.match(hooks, /嵌套解释器|编码执行/);
  assert.equal(readAudit(dir).at(-1).reason, 'shell-indirect-exec');
  // 安全键也不进书账分支（文案说明原因）
  for (const command of [
    'git -c user.name=x commit -m y',
    'git -cuser.name=x commit -m y',
    'git -c=user.name=x commit -m y',
    'git --config-env=user.name=CONFIG_ENV_NAME commit -m y',
  ]) {
    const denied = denyBookkeeping(projectOnly, dir, command);
    assert.match(denied, /-c \/ --config-env/, command);
  }
});

check('op-004 P1-3：`-c alias.*` 硬拒；未知 git 子命令不再当 readonly', () => {
  const baseDir = workspace('op004-alias-classify');
  assert.equal(
    classifyShellCommand({ command: "git -c 'alias.zz=commit -a -m pwn' zz", baseDir, shell: 'bash' }).kind,
    'indirect',
  );
  assert.equal(classifyShellCommand({ command: 'git zz', baseDir, shell: 'bash' }).kind, 'undecidable');
  assert.equal(classifyShellCommand({ command: 'git submodule update --init', baseDir, shell: 'bash' }).kind, 'undecidable');
  // index / refs / 对象库类子命令沿用旧行为（不误杀日常 `git add` 流程）
  assert.equal(classifyShellCommand({ command: 'git add -A', baseDir, shell: 'bash' }).kind, 'none');
  // 持久化别名同源（P1-3）；只读用法照旧
  assert.equal(classifyShellCommand({ command: 'git config alias.zz "!rm -rf src"', baseDir, shell: 'bash' }).kind, 'indirect');
  assert.equal(classifyShellCommand({ command: 'git config alias.zz', baseDir, shell: 'bash' }).kind, 'none');
  assert.equal(classifyShellCommand({ command: 'git config --get alias.zz', baseDir, shell: 'bash' }).kind, 'none');
  // 端到端：plan_review 相位（无书账窗口）也硬拒别名展开
  const projectDir = project('op004-alias-project', planFlow);
  const denied = String(projectOnly(shellExec('bash', projectDir, "git -c 'alias.zz=commit -a -m pwn' zz")));
  assert.match(denied, /嵌套解释器|编码执行/);
  assert.equal(readAudit(projectDir).at(-1).reason, 'shell-indirect-exec');
  // 未知子命令落第 4 类：默认 warn（审计可见），strict 才拒
  assert.equal(projectOnly(shellExec('bash', projectDir, 'git zz')), undefined);
  assert.equal(readAudit(projectDir).at(-1).kind, 'undecidable');
});

check('op-004 P1-4 / op-006：非白名单 `GIT_*` 前缀（含 GIT_DIR）一律第 1 类，文案说明仓库归属', () => {
  const repo = gitProject('op004-env-prefix', noStageFlow);
  if (repo === null) return;
  const { dir } = repo;
  tamperFile(join(dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  for (const command of [
    'GIT_DIR=../other/.git GIT_WORK_TREE=../other git commit -m x',
    'env GIT_DIR=../other/.git git commit -m x',
    'GIT_INDEX_FILE=.git/index.other git commit -m x',
  ]) {
    const denied = denyBookkeeping(projectOnly, dir, command);
    assert.match(denied, /无法校验仓库归属/, command);
  }
  // 分类层面：赋值前缀被剥离后先判 env 白名单（GIT_DIR 属非白名单）
  const classified = classifyShellCommand({ command: 'GIT_DIR=../x git commit -m x', baseDir: dir, shell: 'bash' });
  assert.equal(classified.kind, 'indirect');
  assert.match(classified.detail, /无法校验仓库归属/);
  // 只读子命令也不能借非白名单 GIT_* 绕过
  assert.equal(typeof projectOnly(shellExec('bash', dir, 'GIT_DIR=../x git status')), 'string');
});

check('op-004 P2-1：workdir 指向被忽略的嵌套仓库 → 不判纯书账', () => {
  const repo = gitProject('op004-workdir-nested', noStageFlow);
  if (repo === null) return;
  const { dir, git } = repo;
  const nested = join(dir, 'nested');
  mkdirSync(nested, { recursive: true });
  const nestedGit = (...args) => execFileSync('git', args, { cwd: nested, stdio: 'ignore', windowsHide: true });
  try {
    nestedGit('-c', 'init.defaultBranch=main', 'init');
    nestedGit('config', 'user.email', 'guard-test@example.com');
    nestedGit('config', 'user.name', 'guard-test');
    writeFileSync(join(nested, 'a.txt'), 'a', 'utf8');
    nestedGit('add', '-A');
    nestedGit('commit', '-m', 'nested init');
  } catch {
    return;
  }
  // 外层 `.gitignore` 忽略 nested/ → 外层 status 看着干净（旧实现会放行）
  writeFileSync(join(dir, '.gitignore'), '.openfeel/dev/\n.openfeel/log/\n.openfeel/tmp/\nnested/\n', 'utf8');
  git('add', '.gitignore');
  git('commit', '-m', 'ignore nested');
  tamperFile(join(dir, '.openfeel', 'flow.json'), (raw) => { raw.__bookkeeping = true; });
  clearGuardCache();
  const denied = denyBookkeeping(projectOnly, dir, 'git commit -m x', 'bash', 'nested');
  assert.match(denied, /不是项目工作区/);
});

check('op-004 P1-2：`git mv src/a.ts .openfeel/a.ts` → DENY（R 旧路径同样算）', () => {
  const repo = gitProject('op004-rename-into-openfeel', noStageFlow);
  if (repo === null) return;
  const { dir, git } = repo;
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.ts'), 'a', 'utf8');
  git('add', '-A');
  git('commit', '-m', 'src a');
  git('mv', 'src/a.ts', '.openfeel/a.ts');
  clearGuardCache();
  const denied = denyBookkeeping(projectOnly, dir, 'git commit -m x');
  assert.match(denied, /src\/a\.ts/);
});

// ── v1.5.12 / stage-127 op-006：git「外部执行面」由黑名单改白名单（根治）────────

check('op-006：`-c` / `--config-env` / `git config` 的安全键白名单之外一律第 1 类', () => {
  const baseDir = workspace('op006-config-allowlist');
  for (const command of [
    'git -c diff.external="sh run-me.sh" diff',
    'git -c core.pager=less log',
    'git -c core.editor=vim commit -m x',
    'git -c gpg.program=gpg2 tag',
    'git -c include.path=evil.cfg status',
    'git -c alias.zz=status zz',
    'git config diff.external "sh run-me.sh"',
  ]) {
    const r = classifyShellCommand({ command, baseDir, shell: 'bash' });
    assert.equal(r.kind, 'indirect', command);
    assert.match(r.detail, /安全白名单/, command);
  }
  // 安全键（user.* / color.* / core.quotepath|autocrlf|safecrlf / i18n.*）不误杀
  for (const command of [
    'git -c user.name=x commit -m y',
    'git -c user.email=a@b.com commit -m y',
    'git -c color.ui=always diff',
    'git -c core.quotepath=false status',
    'git -c core.autocrlf=true add .',
    'git -c i18n.logOutputEncoding=utf-8 log',
    'git --config-env=user.name=CONFIG_ENV_NAME commit -m y',
    'git config user.name x',
    'git config --get diff.external',
  ]) {
    assert.notEqual(classifyShellCommand({ command, baseDir, shell: 'bash' }).kind, 'indirect', command);
  }
});

check('op-006：非白名单 `GIT_*` 环境前缀一律第 1 类（身份/时间戳白名单不误杀）', () => {
  const baseDir = workspace('op006-env-allowlist');
  for (const command of [
    'GIT_EXTERNAL_DIFF="sh run-me.sh" git diff',
    'GIT_CONFIG_GLOBAL=evil.cfg git zz',
    'GIT_PAGER=less git log',
    'GIT_SSH_COMMAND="ssh -o ProxyCommand=x" git fetch',
    'GIT_ASKPASS=evil git push',
    'env GIT_EXTERNAL_DIFF="sh run-me.sh" git diff',
    'GIT_DIR=../other/.git git status',
  ]) {
    const r = classifyShellCommand({ command, baseDir, shell: 'bash' });
    assert.equal(r.kind, 'indirect', command);
    assert.match(r.detail, /安全白名单|无法校验仓库归属/, command);
  }
  for (const command of [
    'GIT_AUTHOR_NAME=x git commit -m y',
    'GIT_COMMITTER_EMAIL=a@b git commit -m y',
    'GIT_AUTHOR_DATE="2026-01-01T00:00:00Z" git commit -m y',
  ]) {
    assert.equal(classifyShellCommand({ command, baseDir, shell: 'bash' }).kind, 'whole-tree', command);
  }
});

check('op-006：端到端负例 DENY + 日常命令零误杀', () => {
  const cwd = project('op006-e2e', planFlow);
  for (const command of [
    'git -c diff.external="sh run-me.sh" diff',
    'GIT_EXTERNAL_DIFF="sh run-me.sh" git diff',
    'GIT_CONFIG_GLOBAL=evil.cfg git zz',
    'git -c core.pager=less log',
    'GIT_PAGER=less git log',
    'GIT_ASKPASS=evil git push',
  ]) {
    assert.equal(typeof projectOnly(shellExec('bash', cwd, command)), 'string', command);
    assert.equal(readAudit(cwd).at(-1).reason, 'shell-indirect-exec', command);
  }
  // 白名单 env / 安全键不升级为第 1 类（commit 仍按相位判）
  String(projectOnly(shellExec('bash', cwd, 'GIT_AUTHOR_NAME=x git commit -m y')));
  assert.equal(readAudit(cwd).at(-1).reason, 'shell-git-whole-tree');
  const execCwd = project('op006-e2e-exec', execFlow);
  for (const command of ['GIT_AUTHOR_NAME=x git commit -m y', 'git -c user.name=x commit -m y']) {
    assert.equal(projectOnly(shellExec('bash', execCwd, command)), undefined, command);
  }
  // 日常命令零误杀
  for (const command of [
    'git status', 'git diff', 'git log', 'git add .',
    'npx vitest run', 'npm run build', 'openfeel flow status',
  ]) {
    assert.equal(projectOnly(shellExec('bash', cwd, command)), undefined, command);
  }
});

// V4：真实宿主 marker 与真实全局目录未被本测试改写（loaded_hash 变 → FAIL；仅时间/条目变 → skip）。
check('B/V4：真实 marker 与真实全局目录未被本测试改写', () => {
  const verdict = assertRealGuardUntouched(realGuardBefore, iso);
  assert.ok(verdict === 'PASS' || verdict === 'skip: host-active', `未知判定：${verdict}`);
  if (verdict !== 'PASS') process.stdout.write(`       (${verdict})\n`);
});

rmSync(root, { recursive: true, force: true });

process.stdout.write(`\n通过 ${passed} / ${passed + failed}\n`);
if (failed > 0) {
  process.stdout.write(`失败 ${failed}\n`);
  process.exitCode = 1;
}
