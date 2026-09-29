const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const flow = path.join(os.tmpdir(), 's49rev', '.openfeel', 'flow.json');
const cli = path.join(process.cwd(), 'bin', 'openfeel.js');
const cwd = path.join(os.tmpdir(), 's49rev');

function health() {
  let out = '', code = 0;
  try { out = execSync(`node "${cli}" flow health`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = String(e.stdout || ''); code = e.status; }
  const fails = (out.match(/status[^\n]*fail|\bfail\b[^\n]*/g) || []).length;
  const sections = (out.match(/^(flow\.json|交叉|僵尸|悬空依赖|config\.yaml|pipeline\.yaml|deps\.yaml)/gm) || []).join(',');
  const failLines = out.split('\n').filter(l => /✖|fail/i.test(l)).map(l => l.trim().slice(0, 70));
  return { code, failLines };
}

// 对照 1：悬空 deps 存在
const r1 = health();
console.log('[health with dangling]', 'exit=' + r1.code, '| fail lines:', JSON.stringify(r1.failLines));

// 对照 2：移除悬空 deps
const j = JSON.parse(fs.readFileSync(flow, 'utf8'));
delete j.stages['v1.0.0-stage-01'].deps;
fs.writeFileSync(flow, JSON.stringify(j, null, 2) + '\n');
const r2 = health();
console.log('[health without dangling]', 'exit=' + r2.code, '| fail lines:', JSON.stringify(r2.failLines));

// B2 全名归一化（fixture1 有 stage-01，无管道）
let out3 = '', code3 = 0;
try { out3 = execSync(`node "${cli}" plan stage add stage-09 --deps v1.0.0-stage-01`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { out3 = String(e.stdout || ''); code3 = e.status; }
console.log('[B2 long-name in fixture1]', 'exit=' + code3, '|', out3.trim().split('\n')[0].slice(0, 50));
