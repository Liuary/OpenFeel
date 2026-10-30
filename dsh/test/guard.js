/**
 * OpenFeel × DSH — 写入门禁测试
 *
 * 纯 Node 运行：`node dsh/test/guard.js`
 * 只使用临时目录与 fake ToolExecution，不接触真实 DSH 运行时。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clearGuardCache, createOpenFeelGuard, isPresentationalAssetPath, normalizeForComparison, parsePatchTargets } from '../lib/guard.js';
import { renderBootstrapPrompt, renderFeelPrompt } from '../lib/surface/prompt.js';

const root = mkdtempSync(join(tmpdir(), 'openfeel-guard-'));
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

check('非 mutating 工具放行（feel_status/read/pwsh）', () => {
  const cwd = project('non-mutating', planFlow);
  for (const name of ['feel_status', 'read', 'todo_write', 'pwsh']) {
    assert.equal(projectOnly(execution(name, cwd, {})), undefined, name);
  }
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

check('v1.4.0：chore 窗口（无活跃阶段）允许源码 + 审计 reason=chore', () => {
  const cwd = project('chore-done', noStageFlow);
  mkdirSync(join(cwd, '.openfeel'), { recursive: true });
  writeFileSync(
    join(cwd, '.openfeel', 'chore.json'),
    JSON.stringify({ id: 'CHORE-test', note: 'ui tweak', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), stage_count_at_start: 1 }),
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

rmSync(root, { recursive: true, force: true });

process.stdout.write(`\n通过 ${passed} / ${passed + failed}\n`);
if (failed > 0) {
  process.stdout.write(`失败 ${failed}\n`);
  process.exitCode = 1;
}
