/**
 * op-002 自测验证脚本
 * 验证 REV-001/002/003 三项修复（针对 dist 编译产物）
 * 通过 USERPROFILE 环境变量重定向 homedir，不触碰真实 profile.yaml
 */
import { mkdirSync, rmSync, writeFileSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 重定向 homedir 到临时目录（os.homedir 在 win32 优先读 USERPROFILE）
const fakeHome = mkdtempSync(join(tmpdir(), 'op002-'));
process.env.USERPROFILE = fakeHome;
process.env.HOME = fakeHome;

// 延迟 import，确保环境变量已生效
const { readProfile, ensureProfileDefaults } = await import('../../dist/core/config.js');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── REV-002：readProfile 保留顶层 passthrough 字段 ──
const openfeelDir = join(fakeHome, '.config', 'openfeel');
mkdirSync(openfeelDir, { recursive: true });
const profilePath = join(openfeelDir, 'profile.yaml');
writeFileSync(profilePath, [
  'user:',
  '  name: TestUser',
  'preferences:',
  '  auto_advance: enabled',
  'custom_top_level: keep-me',
  'another_ext: 123',
].join('\n') + '\n', 'utf-8');

const prof = readProfile();
check('REV-002: readProfile 保留顶层 passthrough 字段', prof.custom_top_level === 'keep-me' && prof.another_ext === 123,
  `custom_top_level=${JSON.stringify(prof.custom_top_level)}`);
check('REV-002: 已知字段仍正确合并', prof.user?.name === 'TestUser' && prof.preferences?.auto_advance === 'enabled',
  `name=${prof.user?.name}`);

// ── REV-003：projectPath 规范化去重 ──
// 同一项目不同路径形式（分隔符、尾斜杠、. / ..）应归一为同一路径
// 注：盘符大小写（c: vs C:）超出 resolve() 能力范围，为已知限制，此处不测
const forms = ['C:\\foo', 'C:/foo', 'C:\\foo\\', 'C:\\foo\\bar\\..'];
for (const f of forms) {
  ensureProfileDefaults(f);
}
const prof2 = readProfile();
const uniq = new Set(prof2.history?.recent_projects ?? []);
check('REV-003: 4 种路径形式归一为 1 个条目', uniq.size === 1 && (prof2.history?.recent_projects ?? []).length === 1,
  `recent_projects=${JSON.stringify(prof2.history?.recent_projects)}`);
check('REV-003: 归一结果为 C:\\foo', prof2.history?.recent_projects?.[0] === 'C:\\foo',
  `[0]=${JSON.stringify(prof2.history?.recent_projects?.[0])}`);
check('REV-003: last_project 为规范化路径', prof2.history?.last_project === 'C:\\foo',
  `last_project=${JSON.stringify(prof2.history?.last_project)}`);

// 确认写回后 passthrough 字段仍在（REV-002 修复防止抹除）
const fileContent = readFileSync(profilePath, 'utf-8');
check('REV-002: 自动写回后扩展字段未抹除', fileContent.includes('keep-me') && fileContent.includes('another_ext'));

// ── REV-001：写盘失败静默降级 ──
// 将 profile.yaml 位置替换为目录，writeFileSync 将抛 EISDIR/EPERM
rmSync(profilePath, { force: true });
mkdirSync(profilePath, { recursive: true }); // profile.yaml 现在是目录 → 写盘必失败
let threw = false;
try {
  ensureProfileDefaults('C:\\new-project');
} catch (e) {
  threw = true;
  console.log('   异常详情:', e);
}
check('REV-001: 写盘失败不抛异常（降级）', !threw);

// ── 收尾 ──
rmSync(fakeHome, { recursive: true, force: true });
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
