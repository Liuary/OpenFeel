// stage-49 blocking 修复审查：B1 非dry-run落盘核对 + health 悬空 + fixture2 复用
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const flow = path.join(os.tmpdir(), 's49rev', '.openfeel', 'flow.json');
const cli = path.join(process.cwd(), 'bin', 'openfeel.js');
const repo = process.cwd();

// 1) B1 非 dry-run 落盘核对
const j = JSON.parse(fs.readFileSync(flow, 'utf8'));
const s1 = j.stages['v1.0.0-stage-01'];
console.log('[B1 real-run result] rev=' + j.meta.revision + ' phase=' + s1.phase + ' status=' + s1.status);

// 2) health 悬空依赖（stage-01 deps 注入悬空 → health 非 quick）
s1.deps = ['v1.0.0-stage-99'];
fs.writeFileSync(flow, JSON.stringify(j, null, 2) + '\n');
let out = '';
try { out = execSync(`node "${cli}" flow health`, { cwd: path.join(os.tmpdir(), 's49rev'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); console.log('[health exit code]', e.status); }
const m = out.match(/悬空依赖[^\n]*/g);
console.log('[health dangling]', m ? m[0].slice(0, 90) : '(no section)');

// 3) B2 归一化（全名）补测：fixture2 无管道
const p2 = path.join(os.tmpdir(), 's49rev2');
let out2 = '';
try { out2 = execSync(`node "${cli}" plan stage add stage-08 --deps v1.0.0-stage-01`, { cwd: p2, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { out2 = String(e.stdout || '') + ' EXIT=' + e.status; }
console.log('[B2 long-name]', out2.trim().split('\n')[0].slice(0, 60), '| exit:', out2.includes('EXIT=') ? out2.match(/EXIT=(\d+)/)[1] : '0');
