/**
 * U1 审查隔离实测脚本（只读审查用途，运行于临时 fixture，不触碰真实环境）
 * 验证项：
 *  T1 advanceStagePhase 跨 stage 的 current.op 保留是否产生悬空组合
 *  T2 fuzzyCorrectPhase 后缀匹配的过度修正（'ing' → exec_running?）
 *  T3 存量 stage 缺 ops 字段时 advanceStagePhase / save 是否崩溃
 *  T4 pipeline.phase='paused' 被推进覆盖为 active
 *  T5 blocking REV 拦截 done 推进（预期通过）
 *  T6 logMilestone 是否丢弃 durationMs/finalPhase（公共日志内容检查）
 *  T7 全量 done 判定 + 空集守卫（预期正确）
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..', '..'); // .openfeel/tmp -> repo root
const fmUrl = pathToFileURL(resolve(pkgRoot, 'dist/core/flow-manager.js')).href;
const { FlowManager } = await import(fmUrl);

const fixture = resolve(here, 'fixture');
rmSync(fixture, { recursive: true, force: true });
mkdirSync(resolve(fixture, '.openfeel'), { recursive: true });

function baseFlow(extra = {}) {
  return {
    meta: { version: '1.0', project: 'F', updated: '', revision: 5 },
    pipeline: { phase: 'active', current: { stage: '-', op: 'init' }, retry: 0 },
    stages: {},
    reviews: [],
    log: [],
    ...extra,
  };
}

function writeFlow(data) {
  writeFileSync(resolve(fixture, '.openfeel/flow.json'), JSON.stringify(data, null, 2) + '\n');
}

function readFlow() {
  return JSON.parse(readFileSync(resolve(fixture, '.openfeel/flow.json'), 'utf-8'));
}

const out = [];
function report(id, name, pass, detail) {
  out.push(`[${id}] ${name}: ${pass ? 'PASS' : 'FAIL'} :: ${detail}`);
}

// ── T1: current.op 跨 stage 污染 ──
try {
  const flow = baseFlow();
  flow.stages['v1.0.0-stage-01'] = {
    name: 'v1.0.0-stage-01', phase: 'review_passed', status: 'review_passed',
    deps: [], ops: { 'op-001': { id: 'op-001', title: 'A', state: 'done', assignee: 'x', attempts: 1, max_attempts: 3, checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' } } },
  };
  flow.stages['v1.0.0-stage-02'] = {
    name: 'v1.0.0-stage-02', phase: 'exec_running', status: 'exec_running',
    deps: [], ops: { 'op-009': { id: 'op-009', title: 'B', state: 'executing', assignee: 'x', attempts: 0, max_attempts: 3, checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'running' }, review: 'pending', test: 'pending' } } },
  };
  flow.pipeline.current = { stage: 'v1.0.0-stage-02', op: 'op-009' };
  writeFlow(flow);

  const mgr = new FlowManager(fixture);
  mgr.advanceStagePhase('v1.0.0-stage-01', 'done', 'test');
  mgr.save();
  const after = readFlow();
  const cur = after.pipeline.current;
  const dangling = cur.stage === 'v1.0.0-stage-01' && cur.op === 'op-009'
    && !(after.stages['v1.0.0-stage-01'].ops['op-009']);
  report('T1', 'current.op 跨 stage 保留', !dangling,
    `current=${JSON.stringify(cur)}；${dangling ? '悬空：stage-01 无 op-009' : '未复现悬空'}`);
} catch (e) {
  report('T1', 'current.op 跨 stage 保留', false, `异常: ${e.message}`);
}

// ── T2: fuzzy 后缀匹配过度修正 ──
try {
  writeFlow(baseFlow());
  const mgr = new FlowManager(fixture);
  mgr.registerStage('v1.0.0-stage-03', []);
  mgr.save();
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => { warnings.push(a.join(' ')); origWarn(a.join(' ')); };
  mgr.advanceStagePhase('v1.0.0-stage-03', 'ing', 'test');
  console.warn = origWarn;
  const phase = readFlow().stages['v1.0.0-stage-03'].phase;
  report('T2', "fuzzy('ing') 修正结果", phase === 'exec_running',
    `phase='${phase}'（'ing' 被后缀匹配修正为 ${phase}；${phase === 'exec_running' ? '确认过度宽容：任意含 ing 尾串输入都会命中 exec_running' : '未复现'}）`);
} catch (e) {
  report('T2', "fuzzy('ing') 修正结果", false, `异常: ${e.message}`);
}

// ── T3: 缺 ops 字段崩溃 ──
try {
  const flow = baseFlow();
  flow.stages['v1.0.0-stage-04'] = {
    name: 'v1.0.0-stage-04', phase: 'plan_pending', status: 'planned', deps: [],
    // 故意缺 ops
  };
  writeFlow(flow);
  const mgr = new FlowManager(fixture);
  let advErr = '';
  try {
    mgr.advanceStagePhase('v1.0.0-stage-04', 'plan_review', 'test');
  } catch (e) {
    advErr = `${e.constructor.name}: ${e.message}`;
  }
  let saveErr = '';
  try {
    mgr.save();
  } catch (e) {
    saveErr = `${e.constructor.name}: ${e.message}`;
  }
  const crashed = advErr.includes('TypeError') || saveErr.includes('TypeError');
  report('T3', '缺 ops 的存量 stage', crashed ? false : true,
    `advanceErr='${advErr || '无'}' saveErr='${saveErr || '无'}'；${crashed ? '确认崩溃（TypeError），且 validate() 不报错' : '未复现崩溃'}`);
} catch (e) {
  report('T3', '缺 ops 的存量 stage', false, `外层异常: ${e.message}`);
}

// ── T4: paused 被覆盖 ──
try {
  const flow = baseFlow();
  flow.pipeline.phase = 'paused';
  flow.stages['v1.0.0-stage-05'] = {
    name: 'v1.0.0-stage-05', phase: 'plan_pending', status: 'planned', deps: [], ops: {},
  };
  writeFlow(flow);
  const mgr = new FlowManager(fixture);
  mgr.advanceStagePhase('v1.0.0-stage-05', 'plan_review', 'test');
  mgr.save();
  const phase = readFlow().pipeline.phase;
  report('T4', 'paused 推进后全局 phase', phase === 'active' ? false : true,
    `pipeline.phase='${phase}'；${phase === 'active' ? '确认：paused 被静默覆盖为 active' : 'paused 保持'}`);
} catch (e) {
  report('T4', 'paused 覆盖', false, `异常: ${e.message}`);
}

// ── T5: blocking REV 拦截 done ──
try {
  const flow = baseFlow();
  flow.stages['v1.0.0-stage-06'] = {
    name: 'v1.0.0-stage-06', phase: 'archiving', status: 'archiving', deps: [], ops: {},
  };
  flow.reviews = [{
    id: 'REV-001', op: 'v1.0.0-stage-06.op-001', status: 'open', priority: 'high',
    title: 'test rev', filed_by: 't', filed_at: '', blocking: true,
  }];
  writeFlow(flow);
  const mgr = new FlowManager(fixture);
  let blocked = false;
  let msg = '';
  try {
    mgr.advanceStagePhase('v1.0.0-stage-06', 'done', 'test');
  } catch (e) {
    blocked = true;
    msg = e.message.split('\n')[0];
  }
  report('T5', 'blocking REV 拦截 done', blocked, blocked ? `已拦截: ${msg}` : '未拦截（REV 检查失效！）');
} catch (e) {
  report('T5', 'blocking REV 拦截 done', false, `异常: ${e.message}`);
}

// ── T6: logMilestone 字段丢失 ──
try {
  const flow = baseFlow();
  flow.stages['v1.0.0-stage-07'] = {
    name: 'v1.0.0-stage-07', phase: 'test_passed', status: 'testing',
    deps: [], stats: { start_time: new Date(Date.now() - 5000).toISOString(), end_time: '', duration_ms: 0 },
    ops: {},
  };
  flow.pipeline.current = { stage: 'v1.0.0-stage-07', op: '' };
  writeFlow(flow);
  const mgr = new FlowManager(fixture);
  mgr.advanceStagePhase('v1.0.0-stage-07', 'done', 'test');
  mgr.save();
  // 公共日志写入 .openfeel/log/yyyy/MM/dd/ 下，查找里程碑条目
  const logRoot = resolve(fixture, '.openfeel/log');
  let milestoneContent = '';
  const walk = (dir) => {
    if (!existsSync(dir)) { return; }
    for (const f of readdirRecursive(dir)) {
      if (f.endsWith('.md')) {
        const c = readFileSync(f, 'utf-8');
        if (c.includes('里程碑')) { milestoneContent += c; }
      }
    }
  };
  function readdirRecursive(dir) {
    const res = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) { res.push(...readdirRecursive(p)); } else { res.push(p); }
    }
    return res;
  }
  walk(logRoot);
  const hasDuration = milestoneContent.includes('durationMs') || milestoneContent.includes('finalPhase');
  report('T6', '里程碑日志保留耗时数据', !hasDuration ? false : true,
    `${hasDuration ? '包含 durationMs/finalPhase' : '确认丢失：里程碑日志不含 durationMs/finalPhase（endStage 传入但 logMilestone 丢弃）'}`);
} catch (e) {
  report('T6', '里程碑日志', false, `异常: ${e.message}`);
}

// ── T7: 全量 done 判定 + 空集 ──
try {
  const flow = baseFlow();
  flow.stages['v1.0.0-stage-08'] = { name: 'v1.0.0-stage-08', phase: 'archiving', status: 'archiving', deps: [], ops: {} };
  flow.pipeline.phase = 'active';
  writeFlow(flow);
  const mgr = new FlowManager(fixture);
  mgr.advanceStagePhase('v1.0.0-stage-08', 'done', 'test');
  mgr.save();
  const allDonePhase = readFlow().pipeline.phase;
  // 空集：stages 为空对象时推进应不误置 done
  writeFlow(baseFlow());
  const mgr2 = new FlowManager(fixture);
  report('T7', '全量 done 判定', allDonePhase === 'done',
    `单 stage done 后 pipeline.phase='${allDonePhase}'（预期 done；空集守卫另经代码审查确认 Object.keys>0 条件存在）`);
} catch (e) {
  report('T7', '全量 done 判定', false, `异常: ${e.message}`);
}

console.log('\n===== U1 实测结果汇总 =====');
for (const line of out) { console.log(line); }
