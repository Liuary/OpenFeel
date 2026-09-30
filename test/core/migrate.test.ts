/**
 * migrate 单元测试（stage-39 / op-001）
 * 覆盖 detectLegacy / listLegacyFiles / dry-run / 执行 / 幂等 / --remap-assignee / rollback / 备份清理。
 * mock homedir 隔离，不污染真实主目录（REV-1204③）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock homedir（vi.hoisted 变体；回调内不可引用外层 import）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// 备份失败注入开关（T48：对照 setup.test.ts 的 backupMock 范式；默认透传真实实现）
const backupMock = vi.hoisted(() => ({ failFor: null as string | null }));
vi.mock('../../src/core/backup.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/backup.js')>();
  return {
    ...actual,
    backupFileBeforeWrite: (absPath: string, opts: Parameters<typeof actual.backupFileBeforeWrite>[1]) => {
      if (backupMock.failFor && absPath === backupMock.failFor) {
        throw new actual.BackupError(absPath, new Error('injected backup failure'));
      }
      return actual.backupFileBeforeWrite(absPath, opts);
    },
  };
});

import { backupLegacy } from '../../src/core/migrate.js';
import { resetBackupSetCache } from '../../src/core/backup.js';

import {
  detectLegacy, detectDeprecatedCompat, listLegacyFiles, migrateProject, rollbackMigration,
  previewRollback, cleanOldBackups, remapAssignees,
} from '../../src/core/migrate.js';
import { loadUpdateState, loadGlobalUpdateState } from '../../src/core/update-state.js';
import {
  existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, readdirSync, statSync, copyFileSync,
} from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';

/** 静态 legacy fixture 根目录 */
const FIXTURE = resolve(process.cwd(), 'test', 'fixtures', 'legacy-project');

/** 全局 opencode 目录（基于 mock home） */
function globalOpencodeDir(): string { return join(mockHome.dir, '.config', 'opencode'); }
function globalAgentsDir(): string { return join(globalOpencodeDir(), 'agents'); }
function globalSkillsDir(): string { return join(globalOpencodeDir(), 'skills'); }
function globalCoreMdPath(): string { return join(globalOpencodeDir(), 'openfeel', 'core.md'); }
function globalAgentsMdPath(): string { return join(globalOpencodeDir(), 'AGENTS.md'); }
function globalJsoncPath(): string { return join(globalOpencodeDir(), 'opencode.jsonc'); }

/** 递归复制目录 */
function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) { copyDirSync(s, d); } else { copyFileSync(s, d); }
  }
}

/** 目录快照：相对路径 → 内容（用于 dry-run 不写盘 / rollback 恢复断言；忽略备份目录） */
function snapshotDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const rel = relative(dir, p).replace(/\\/g, '/');
      // 备份目录为 migrate 的正常产物，不参与「恢复前状态」比对
      if (rel.startsWith('.openfeel/backup')) continue;
      if (statSync(p).isDirectory()) { walk(p); } else { out[rel] = readFileSync(p, 'utf-8'); }
    }
  };
  walk(dir);
  return out;
}

describe('migrate', () => {
  let homeDir: string;
  let projects: string[];

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-migrate-home-'));
    mockHome.dir = homeDir;
    projects = [];
    resetBackupSetCache();
  });

  afterEach(() => {
    for (const p of projects) { rmSync(p, { recursive: true, force: true }); }
    rmSync(homeDir, { recursive: true, force: true });
  });

  /** 复制 fixture 到临时项目目录（可选剔除 custom-agent.md，构造纯框架项目） */
  function makeProject(includeCustom = true): string {
    const dir = mkdtempSync(join(tmpdir(), 'openfeel-migrate-proj-'));
    copyDirSync(FIXTURE, dir);
    if (!includeCustom) { rmSync(join(dir, '.opencode', 'agents', 'custom-agent.md'), { force: true }); }
    projects.push(dir);
    return dir;
  }

  describe('detectLegacy', () => {
    it('legacy fixture：五条判据组合触发，isLegacy=true', () => {
      const proj = makeProject();
      const r = detectLegacy(proj);
      expect(r.projectOpendirAgents).toBe(true);
      expect(r.projectOpendirSkills).toBe(true);
      expect(r.projectOpendirInstructions).toBe(true);
      expect(r.legacyJsoncSkillsMapping).toBe(true);
      expect(r.legacyJsoncInstructions).toBe(true);
      expect(r.mixedUpdateState).toBe(true);
      expect(r.isLegacy).toBe(true);
    });

    it('空目录：全部为 false，isLegacy=false', () => {
      const empty = mkdtempSync(join(tmpdir(), 'openfeel-migrate-empty-'));
      projects.push(empty);
      const r = detectLegacy(empty);
      expect(r.isLegacy).toBe(false);
      expect(r.projectOpendirAgents).toBe(false);
      expect(r.projectOpendirSkills).toBe(false);
      expect(r.projectOpendirInstructions).toBe(false);
      expect(r.legacyJsoncSkillsMapping).toBe(false);
      expect(r.legacyJsoncInstructions).toBe(false);
      expect(r.mixedUpdateState).toBe(false);
    });

    it('仅项目自定义资产（无框架同源）→ 判据 ①② 不计，isLegacy=false（REV-007）', () => {
      const proj = makeProject();
      // 移除全部框架同源资产，仅留 custom-agent.md
      rmSync(join(proj, '.opencode', 'agents', 'planner.md'), { force: true });
      rmSync(join(proj, '.opencode', 'skills'), { recursive: true, force: true });
      rmSync(join(proj, '.opencode', 'instructions'), { recursive: true, force: true });
      writeFileSync(join(proj, 'opencode.jsonc'), '{ "custom_field": "x" }\n', 'utf-8');
      writeFileSync(join(proj, '.openfeel', 'update_state.json'), JSON.stringify({ version: '1.0', last_update: '', openfeel_version: '1.0.0', files: { 'AGENTS.md': { hash: 'h', status: 'clean' } } }), 'utf-8');
      const r = detectLegacy(proj);
      expect(r.projectOpendirAgents).toBe(false);
      expect(r.projectOpendirSkills).toBe(false);
      expect(r.isLegacy).toBe(false);
    });
  });

  describe('listLegacyFiles', () => {
    it('框架同源条目归 framework，项目自定义归 custom（REV-007）', () => {
      const proj = makeProject();
      const { framework, custom } = listLegacyFiles(proj);
      const norm = (p: string): string => relative(proj, p).replace(/\\/g, '/');
      expect(framework.map(norm).sort()).toEqual([
        '.opencode/agents/planner.md',
        '.opencode/instructions/core.md',
        '.opencode/skills/check-kb/SKILL.md',
      ]);
      expect(custom.map(norm)).toEqual(['.opencode/agents/custom-agent.md']);
    });
  });

  describe('migrateProject --dry-run', () => {
    it('不写盘：前后项目目录与全局目录快照一致；报告含检测/清理/保留/assignee', () => {
      const proj = makeProject();
      const beforeProj = snapshotDir(proj);
      const beforeHome = snapshotDir(mockHome.dir);
      const result = migrateProject(proj, { dryRun: true });
      expect(result.backupDir).toBeNull();
      expect(result.deployed).toEqual([]);
      expect(result.cleaned.length).toBe(3);
      expect(result.keptCustom.length).toBe(1);
      expect(result.assigneeReport.length).toBeGreaterThan(0);
      expect(result.assigneeReport[0]).toMatchObject({ oldName: 'planner', newName: 'openfeel-planner' });
      // 未写盘
      expect(snapshotDir(proj)).toEqual(beforeProj);
      expect(snapshotDir(mockHome.dir)).toEqual(beforeHome);
    });

    it('dry-run + --remap-assignee 时 assigneeReport 非空（REV-1307）', () => {
      const proj = makeProject();
      const result = migrateProject(proj, { dryRun: true, remapAssignee: true });
      expect(result.assigneeReport.length).toBeGreaterThan(0);
      // dry-run 不改写 flow.json
      const flow = JSON.parse(readFileSync(join(proj, '.openfeel', 'flow.json'), 'utf-8'));
      expect(flow.stages['stage-01'].ops['op-001'].assignee).toBe('planner');
    });
  });

  describe('migrateProject 执行', () => {
    it('framework 清理、custom 保留、jsonc 清理非法字段保留用户字段、state 拆分重键', () => {
      const proj = makeProject();
      const result = migrateProject(proj);

      // framework 清理（含空 skills 子目录）
      expect(existsSync(join(proj, '.opencode', 'agents', 'planner.md'))).toBe(false);
      expect(existsSync(join(proj, '.opencode', 'skills'))).toBe(false);
      expect(existsSync(join(proj, '.opencode', 'instructions'))).toBe(false);
      // custom 保留原位
      expect(existsSync(join(proj, '.opencode', 'agents', 'custom-agent.md'))).toBe(true);
      expect(result.keptCustom.some((p) => p.endsWith('custom-agent.md'))).toBe(true);

      // opencode.jsonc：非法 skills/instructions 移除，用户字段保留
      const jsonc = JSON.parse(readFileSync(join(proj, 'opencode.jsonc'), 'utf-8'));
      expect('skills' in jsonc).toBe(false);
      expect('instructions' in jsonc).toBe(false);
      expect(jsonc.custom_field).toBe('keep-me');

      // 全局部署文件落盘（v1.1.1：全局 AGENTS.md 承载约束，旧 core.md 不再生成）
      expect(existsSync(join(globalAgentsDir(), 'openfeel-planner.md'))).toBe(true);
      expect(existsSync(globalAgentsMdPath())).toBe(true);
      expect(existsSync(globalCoreMdPath())).toBe(false);

      // 项目 state：框架 key 移除，项目 key 保留
      const projState = loadUpdateState(proj)!;
      expect(projState.files['.opencode/agents/planner.md']).toBeUndefined();
      expect(projState.files['AGENTS.md']).toBeDefined();

      // 全局 state：旧 agent 重键为新名；旧 skill 补 openfeel- 前缀（REV-1303）
      const gState = loadGlobalUpdateState()!;
      expect(gState.files[join(globalAgentsDir(), 'openfeel-planner.md')]).toBeDefined();
      expect(gState.files[join(globalSkillsDir(), 'openfeel-check-kb', 'SKILL.md')]).toBeDefined();
      expect(result.stateSplit.movedToGlobal).toContain(join(globalAgentsDir(), 'openfeel-planner.md'));
      expect(result.stateSplit.movedToGlobal).toContain(join(globalSkillsDir(), 'openfeel-check-kb', 'SKILL.md'));
      // remapLegacyKey：.opencode/instructions/core.md → 全局 AGENTS.md（v1.1.1）
      expect(result.stateSplit.movedToGlobal).toContain(globalAgentsMdPath());
    });

    it('合法 skills {paths,urls} 结构保留，不误删（REV-1305）', () => {
      const proj = makeProject();
      writeFileSync(
        join(proj, 'opencode.jsonc'),
        JSON.stringify({ $schema: 'x', skills: { paths: ['a'], urls: [] }, custom_field: 'x' }, null, 2) + '\n',
        'utf-8',
      );
      migrateProject(proj);
      const jsonc = JSON.parse(readFileSync(join(proj, 'opencode.jsonc'), 'utf-8'));
      expect(jsonc.skills).toEqual({ paths: ['a'], urls: [] });
    });

    it('幂等：二次 migrate 输出 isLegacy=false、cleaned 为空（REV-1204①）', () => {
      const proj = makeProject();
      migrateProject(proj);
      const second = migrateProject(proj);
      expect(second.legacy.isLegacy).toBe(false);
      expect(second.backupDir).toBeNull();
      expect(second.cleaned).toEqual([]);
    });

    it('--remap-assignee 改写 flow.json assignee；不带 flag 不改写（M5 / REV-1204②）', () => {
      const proj1 = makeProject();
      migrateProject(proj1);
      const flow1 = JSON.parse(readFileSync(join(proj1, '.openfeel', 'flow.json'), 'utf-8'));
      expect(flow1.stages['stage-01'].ops['op-001'].assignee).toBe('planner');

      const proj2 = makeProject();
      const r2 = migrateProject(proj2, { remapAssignee: true });
      expect(r2.remapped).toBe(true);
      const flow2 = JSON.parse(readFileSync(join(proj2, '.openfeel', 'flow.json'), 'utf-8'));
      expect(flow2.stages['stage-01'].ops['op-001'].assignee).toBe('openfeel-planner');
    });

    it('全局 opencode.jsonc parse 失败时降级保留原文件（REV-1306）', () => {
      const proj = makeProject();
      mkdirSync(globalOpencodeDir(), { recursive: true });
      const original = '{ /* block comment 不支持 */ "foo": 1 }\n';
      writeFileSync(globalJsoncPath(), original, 'utf-8');
      expect(() => migrateProject(proj)).not.toThrow();
      expect(readFileSync(globalJsoncPath(), 'utf-8')).toBe(original);
    });
  });

  describe('detectDeprecatedCompat / --clean-global-core-md（v1.1.1）', () => {
    it('空项目：globalCoreMdExists=false, projectAgentsMdExists=false', () => {
      const empty = mkdtempSync(join(tmpdir(), 'openfeel-dep-'));
      projects.push(empty);
      expect(detectDeprecatedCompat(empty)).toEqual({ globalCoreMdExists: false, projectAgentsMdExists: false });
    });

    it('项目根 AGENTS.md / 全局 core.md 存在时分别检出', () => {
      const proj = mkdtempSync(join(tmpdir(), 'openfeel-dep-'));
      projects.push(proj);
      writeFileSync(join(proj, 'AGENTS.md'), '# x\n', 'utf-8');
      mkdirSync(join(globalOpencodeDir(), 'openfeel'), { recursive: true });
      writeFileSync(globalCoreMdPath(), 'old\n', 'utf-8');
      expect(detectDeprecatedCompat(proj)).toEqual({ globalCoreMdExists: true, projectAgentsMdExists: true });
    });

    it('migrate 默认保留全局 core.md；--clean-global-core-md 删除；dry-run 不删', () => {
      const proj = mkdtempSync(join(tmpdir(), 'openfeel-dep-'));
      projects.push(proj);
      mkdirSync(join(globalOpencodeDir(), 'openfeel'), { recursive: true });
      writeFileSync(globalCoreMdPath(), 'old\n', 'utf-8');

      // 默认仅提示，不删
      migrateProject(proj);
      expect(existsSync(globalCoreMdPath())).toBe(true);

      // dry-run + 标志：不删
      migrateProject(proj, { dryRun: true, cleanGlobalCoreMd: true });
      expect(existsSync(globalCoreMdPath())).toBe(true);

      // 显式标志：删除
      migrateProject(proj, { cleanGlobalCoreMd: true });
      expect(existsSync(globalCoreMdPath())).toBe(false);
    });
  });

  describe('remapAssignees', () => {
    it('Object.values 遍历 stages/ops 对象不抛错；dryRun 不写，执行改写', () => {
      const proj = makeProject();
      const dry = remapAssignees(proj, true);
      expect(dry.count).toBe(1);
      expect(dry.changes[0]).toBe('stage-01.op-001: planner → openfeel-planner');
      const before = JSON.parse(readFileSync(join(proj, '.openfeel', 'flow.json'), 'utf-8'));
      expect(before.stages['stage-01'].ops['op-001'].assignee).toBe('planner');

      const applied = remapAssignees(proj, false);
      expect(applied.count).toBe(1);
      const after = JSON.parse(readFileSync(join(proj, '.openfeel', 'flow.json'), 'utf-8'));
      expect(after.stages['stage-01'].ops['op-001'].assignee).toBe('openfeel-planner');
    });
  });

  describe('rollback', () => {
    it('恢复执行前状态（文件 + jsonc + state + flow.json），并移除本次全局 state 新增条目（REV-1201/1302）', () => {
      const proj = makeProject();
      const beforeProj = snapshotDir(proj);
      migrateProject(proj, { remapAssignee: true });
      // 迁移后确已改变
      expect(existsSync(join(proj, '.opencode', 'agents', 'planner.md'))).toBe(false);
      const gState = loadGlobalUpdateState()!;
      expect(Object.keys(gState.files)).toContain(join(globalAgentsDir(), 'openfeel-planner.md'));

      const r = rollbackMigration(proj);
      expect(r.stateRestored).toBe(true);
      expect(r.restored.length).toBeGreaterThan(0);
      // 项目文件恢复执行前状态（flow.json assignee 亦还原）
      expect(snapshotDir(proj)).toEqual(beforeProj);
      // 全局 state 仅移除本次新增 key
      const gState2 = loadGlobalUpdateState()!;
      expect(Object.keys(gState2.files)).not.toContain(join(globalAgentsDir(), 'openfeel-planner.md'));
      // 全局文件不还原（仍存在，幂等可重建）
      expect(existsSync(join(globalAgentsDir(), 'openfeel-planner.md'))).toBe(true);
    });

    it('previewRollback 返回 entries 预览（source + op 类型）不写盘（REV-1309）', () => {
      const proj = makeProject();
      migrateProject(proj);
      const before = snapshotDir(proj);
      const entries = previewRollback(proj);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.op === 'delete' && e.source.includes('planner.md'))).toBe(true);
      expect(entries.some((e) => e.op === 'modify' && e.source === 'opencode.jsonc')).toBe(true);
      expect(snapshotDir(proj)).toEqual(before);
    });
  });

  describe('cleanOldBackups', () => {
    it('保留最近 5 次，删除更早的备份目录（REV-1206）', () => {
      const proj = makeProject();
      const root = join(proj, '.openfeel', 'backup');
      const tss = ['20260101000000', '20260102000000', '20260103000000', '20260104000000', '20260105000000', '20260106000000'];
      for (const ts of tss) { mkdirSync(join(root, ts), { recursive: true }); }
      const removed = cleanOldBackups(proj, 5);
      expect(removed).toEqual(['20260101000000']);
      const remain = readdirSync(root).sort();
      expect(remain.length).toBe(5);
      expect(remain).not.toContain('20260101000000');
    });
  });

  // ── 备份健壮性（stage-50 op-005 T48/T49） ──

  describe('备份健壮性（T48/T49）', () => {
    it('T48：全局 jsonc 备份失败 → fail-fast（后续步骤未执行）且 finally 回填 manifest.globalStateKeys', () => {
      const proj = makeProject();
      // 预置全局 jsonc（触发备份尝试）
      mkdirSync(globalOpencodeDir(), { recursive: true });
      writeFileSync(globalJsoncPath(), '{}\n', 'utf-8');
      backupMock.failFor = globalJsoncPath();
      try {
        // fail-fast：备份失败 → BackupError 上抛（migrate 层捕获边界）
        expect(() => migrateProject(proj)).toThrow();
      } finally {
        backupMock.failFor = null;
      }
      // finally 回填：manifest 存在且含 globalStateKeys 数组
      const root = join(proj, '.openfeel', 'backup');
      const dirs = readdirSync(root).filter((d) => /^(\d{14}|\d{17}(-\d+)?)$/.test(d));
      expect(dirs.length).toBeGreaterThan(0);
      const manifest = JSON.parse(readFileSync(join(root, dirs[0], 'manifest.json'), 'utf-8'));
      expect(Array.isArray(manifest.globalStateKeys)).toBe(true);
      // rollback 收敛：可回滚且不抛错
      expect(() => rollbackMigration(proj)).not.toThrow();
    });

    it('T49：同毫秒两次 backupLegacy → 生成不同备份目录（撞名 -N，无覆盖）', () => {
      const proj = makeProject();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-30T12:00:00.123Z'));
      try {
        const report = detectLegacy(proj);
        const r1 = backupLegacy(proj, report);
        const r2 = backupLegacy(proj, report);
        expect(r1.backupDir).not.toBe(r2.backupDir);
        expect(existsSync(r1.backupDir)).toBe(true);
        expect(existsSync(r2.backupDir)).toBe(true);
        const name1 = r1.backupDir.split(/[\\/]/).pop()!;
        const name2 = r2.backupDir.split(/[\\/]/).pop()!;
        // 本地时间戳（17 位，含毫秒）；第二次撞名 → -2 后缀
        expect(name1).toMatch(/^\d{17}$/);
        expect(name2).toMatch(/^\d{17}-\d+$/);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
