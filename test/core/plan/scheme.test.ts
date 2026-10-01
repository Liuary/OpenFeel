/**
 * scheme 单元测试
 * 测试 createScheme、getScheme 和 listSchemes 在临时目录中的行为
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createScheme, getScheme, listSchemes, renameScheme, removeScheme, publishScheme } from '../../../src/core/plan/scheme.js';
import { addStage } from '../../../src/core/plan/stage.js';
import { FlowManager } from '../../../src/core/flow-manager.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('scheme', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-scheme-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createScheme', () => {
    it('应在 stage-01 下创建固定命名 op-001.md 文件（N8-1）', () => {
      // 先创建阶段
      addStage(tmpDir, 'stage-01');

      const opId = createScheme(tmpDir, 'stage-01', '实现登录功能');

      expect(opId).toBe('op-001');

      const filePath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops', 'op-001.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('应返回正确的 opId', () => {
      addStage(tmpDir, 'stage-01');

      const opId = createScheme(tmpDir, 'stage-01', '测试方案');
      expect(opId).toBe('op-001');
    });

    it('生成的模板应包含必填字段', () => {
      addStage(tmpDir, 'stage-01');

      createScheme(tmpDir, 'stage-01', '配置数据库');

      const filePath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops', 'op-001.md');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('# op-001：配置数据库');
      expect(content).toContain('## 目标');
      expect(content).toContain('## 实施步骤');
      expect(content).toContain('## 产出文件');
      expect(content).toContain('## 自测清单');
      expect(content).toContain('## 修正记录');
      // 验证表格分隔线格式
      expect(content).toContain('| 次数 | 时间 | 问题 | 修正内容 |');
    });

    it('多次创建时 opId 递增', () => {
      addStage(tmpDir, 'stage-01');

      const opId1 = createScheme(tmpDir, 'stage-01', '方案一');
      const opId2 = createScheme(tmpDir, 'stage-01', '方案二');
      const opId3 = createScheme(tmpDir, 'stage-01', '方案三');

      expect(opId1).toBe('op-001');
      expect(opId2).toBe('op-002');
      expect(opId3).toBe('op-003');
    });

    it('已存在空占位 op 文件时从 max+1 继续（不重号）', () => {
      addStage(tmpDir, 'stage-01');
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      mkdirSync(opsDir, { recursive: true });
      writeFileSync(join(opsDir, 'op-001_stale.md'), '', 'utf-8'); // 崩溃残留空文件
      const opId = createScheme(tmpDir, 'stage-01', '新方案');
      expect(opId).toBe('op-002');
    });

    it('阶段目录不存在时自动创建', () => {
      // 不预先创建阶段目录，直接 createScheme
      const opId = createScheme(tmpDir, 'stage-03', '自动创建');

      expect(opId).toBe('op-001');

      const filePath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-03', 'ops', 'op-001.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('N8-1：标题含 / 、空格、中文均可创建（不再 ENOENT），文件名为 op-NNN.md', () => {
      addStage(tmpDir, 'stage-01');

      // 旧实现：safeTitle 仅替换空白 → 标题含 '/' 时文件名多一级 → openSync 抛 ENOENT
      expect(() => createScheme(tmpDir, 'stage-01', 'feat/目录 与 中文')).not.toThrow();

      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      const filePath = join(opsDir, 'op-001.md');
      expect(existsSync(filePath)).toBe(true);
      // 标题完整保留在内容首行
      expect(readFileSync(filePath, 'utf-8')).toContain('# op-001：feat/目录 与 中文');
      // 无标题片段文件
      expect(existsSync(join(opsDir, 'op-001_feat_目录 与 中文.md'))).toBe(false);
    });

    it('N8-1：历史命名文件仍占号（序号分配不受影响）', () => {
      addStage(tmpDir, 'stage-01');
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      mkdirSync(opsDir, { recursive: true });
      writeFileSync(join(opsDir, 'op-001.md'), '# op-001：旧\n', 'utf-8');
      writeFileSync(join(opsDir, 'op-002_旧标题.md'), '# op-002：旧标题\n', 'utf-8');

      const opId = createScheme(tmpDir, 'stage-01', '新方案');
      expect(opId).toBe('op-003');
      expect(existsSync(join(opsDir, 'op-003.md'))).toBe(true);
    });

    it('应同步到 flow.json（若 flow.json 存在且包含该阶段）', () => {
      // 先创建 .openfeel/ 目录并初始化 flow.json
      const openfeelDir = join(tmpDir, '.openfeel');
      mkdirSync(openfeelDir, { recursive: true });

      // 使用 FlowManager 初始化 flow.json
      FlowManager.initFlow(tmpDir);

      // 手动添加 stage 到 flow.json
      const flowMgr = new FlowManager(tmpDir);
      const flowData = flowMgr.getData();
      if (flowData) {
        flowData.stages['v1.0.0-stage-01'] = {
          name: 'v1.0.0-stage-01',
          status: 'planned',
          deps: [],
          ops: {},
        };
        flowMgr.save();
      }

      // 创建阶段目录
      addStage(tmpDir, 'stage-01');

      // 创建方案
      const opId = createScheme(tmpDir, 'stage-01', '同步测试');

      expect(opId).toBe('op-001');

      // 重新加载 flow.json 验证同步结果
      const verifyMgr = new FlowManager(tmpDir);
      const verifyData = verifyMgr.getData();
      expect(verifyData).not.toBeNull();

      if (verifyData) {
        const stage = verifyData.stages['v1.0.0-stage-01'];
        expect(stage).toBeDefined();
        expect(stage.ops['op-001']).toBeDefined();
        expect(stage.ops['op-001'].title).toBe('同步测试');
        expect(stage.ops['op-001'].state).toBe('pending');
      }
    });

    it('flow.json 不存在时同步不应报错', () => {
      addStage(tmpDir, 'stage-01');

      // flow.json 不存在时 createScheme 不应抛出异常
      expect(() => {
        createScheme(tmpDir, 'stage-01', '无 flow');
      }).not.toThrow();
    });

    it('createScheme 应在 flow.json 末条写 register_op 审计日志（P7，agent=cli）', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', 'T');

      const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
      const last = flow.log[flow.log.length - 1];
      expect(last.action).toBe('register_op');
      expect(last.agent).toBe('cli');
      expect(last.detail).toEqual({ stageName: 'v1.0.0-stage-01', opId: 'op-001' });
    });

    it('stage-51 N3-1：隐式注册补齐骨架；冲突跳过分支不建骨架', () => {
      FlowManager.initFlow(tmpDir);
      // 正常隐式注册 → 补齐 overview.md / status.md
      createScheme(tmpDir, 'stage-06', 'T');
      const dir6 = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-06');
      expect(existsSync(join(dir6, 'overview.md'))).toBe(true);
      expect(existsSync(join(dir6, 'status.md'))).toBe(true);

      // 冲突：v4-stage-04 已占目录 → v4.0.0-stage-04 跳过注册，不建骨架
      const mgr = new FlowManager(tmpDir);
      mgr.getData()!.stages['v4-stage-04'] = {
        name: 'v4-stage-04', phase: 'plan_pending', status: 'planned', deps: [], ops: {},
      };
      mgr.save();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createScheme(tmpDir, 'v4.0.0-stage-04', 'T');
      warnSpy.mockRestore();

      const dir4 = join(tmpDir, '.openfeel', 'plan', 'v4', 'stage-04');
      expect(existsSync(join(dir4, 'overview.md'))).toBe(false);
      expect(existsSync(join(dir4, 'status.md'))).toBe(false);
    });

    it('兜底自动注册遇 (series, stageDir) 冲突 → console.warn + 跳过注册 + 不抛错（P7 缺口补齐）', () => {
      FlowManager.initFlow(tmpDir);
      const flowMgr = new FlowManager(tmpDir);
      // 直接写入一条 v4-stage-04，模拟 (series, stageDir) 冲突已存在（不经 addStage，避免建目录）
      flowMgr.getData()!.stages['v4-stage-04'] = {
        name: 'v4-stage-04',
        phase: 'plan_pending',
        status: 'planned',
        deps: [],
        ops: {},
      };
      flowMgr.save();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // createScheme('v4.0.0-stage-04')：stage 未注册 → 兜底注册前检测到与 v4-stage-04 冲突
      const opId = createScheme(tmpDir, 'v4.0.0-stage-04', '冲突');
      expect(opId).toBe('op-001'); // op 文件仍创建（不破坏既有契约）
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('映射同一 (series, stageDir)'));
      warnSpy.mockRestore();

      const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
      // 冲突 stageId 未被写入 flow.json（不产生脏键）
      expect(flow.stages['v4.0.0-stage-04']).toBeUndefined();
      // op 文件已创建（固定命名）
      expect(existsSync(join(tmpDir, '.openfeel', 'plan', 'v4', 'stage-04', 'ops', 'op-001.md'))).toBe(true);
    });
  });

  // ── stage-51/N8-2：标题读取兼容回退 ──

  describe('N8-2 extractTitle 兼容（stage-51 op-006）', () => {
    /** 在 stage-01/ops 下直接放置给定文件 */
    function placeOps(files: Record<string, string>): string {
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      mkdirSync(opsDir, { recursive: true });
      for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(opsDir, name), content, 'utf-8');
      }
      return opsDir;
    }

    it('N8-2：新命名 op-NNN.md → 读取内容首行标题', () => {
      placeOps({ 'op-001.md': '# op-001：内容里的标题\n\n## 目标\n' });
      const schemes = listSchemes(tmpDir, 'stage-01');
      expect(schemes).toHaveLength(1);
      expect(schemes[0].opId).toBe('op-001');
      expect(schemes[0].title).toBe('内容里的标题');
    });

    it('N8-2：历史命名 op-NNN_标题.md → 文件名解析（原行为零变化）', () => {
      placeOps({ 'op-004_历史标题.md': '无首行标题\n' });
      const schemes = listSchemes(tmpDir, 'stage-01');
      const s = schemes.find((x) => x.opId === 'op-004');
      expect(s?.title).toBe('历史标题');
    });

    it('N8-2：新命名内容无标题行 → 回退文件名（不抛错）', () => {
      placeOps({ 'op-005.md': '没有标题行\n' });
      const schemes = listSchemes(tmpDir, 'stage-01');
      const s = schemes.find((x) => x.opId === 'op-005');
      expect(s?.title).toBe('op-005');
    });

    it('N8-2：新旧命名混存 → 二者均可列出且标题正确', () => {
      placeOps({
        'op-001.md': '# op-001：新标题\n',
        'op-002_旧标题.md': '# op-002：旧标题\n',
      });
      const schemes = listSchemes(tmpDir, 'stage-01');
      expect(schemes).toHaveLength(2);
      expect(schemes.find((x) => x.opId === 'op-001')?.title).toBe('新标题');
      expect(schemes.find((x) => x.opId === 'op-002')?.title).toBe('旧标题');
    });

    it('N8-3：plan scheme 无 rename/migrate 子命令（A5：不做迁移命令）', async () => {
      const { registerPlanCommand } = await import('../../../src/commands/plan.js');
      const { Command } = await import('commander');
      const program = new Command();
      registerPlanCommand(program);
      const scheme = program.commands.find((c) => c.name() === 'plan')!.commands.find((c) => c.name() === 'scheme')!;
      const names = scheme.commands.map((c) => c.name());
      // op-006 翻转：新增 rename 子命令（仍无 migrate，A5）
      expect(names).toContain('rename');
      expect(names).not.toContain('migrate');
    });
  });

  describe('getScheme', () => {
    it('应通过完整 opId 查找方案', () => {
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', '查找测试');

      const scheme = getScheme(tmpDir, 'stage-01.op-001');
      expect(scheme).not.toBeNull();
      expect(scheme!.opId).toBe('op-001');
      expect(scheme!.stage).toBe('stage-01');
      expect(scheme!.title).toContain('查找测试');
      expect(scheme!.content).toContain('# op-001');
    });

    it('应通过简短 opId 查找方案', () => {
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', '简短查找');

      const scheme = getScheme(tmpDir, 'op-001');
      expect(scheme).not.toBeNull();
      expect(scheme!.opId).toBe('op-001');
      expect(scheme!.stage).toBe('stage-01');
    });

    it('不存在的方案应返回 null', () => {
      addStage(tmpDir, 'stage-01');

      const scheme = getScheme(tmpDir, 'op-999');
      expect(scheme).toBeNull();
    });

    it('完整 opId 格式不匹配时应返回 null', () => {
      addStage(tmpDir, 'stage-01');

      const scheme = getScheme(tmpDir, 'stage-99.op-001');
      expect(scheme).toBeNull();
    });
  });

  describe('listSchemes', () => {
    it('应列出指定阶段的所有方案', () => {
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', '方案A');
      createScheme(tmpDir, 'stage-01', '方案B');

      const schemes = listSchemes(tmpDir, 'stage-01');
      expect(schemes).toHaveLength(2);

      const opIds = schemes.map((s) => s.opId);
      expect(opIds).toContain('op-001');
      expect(opIds).toContain('op-002');
    });

    it('不传阶段名时应列出所有阶段的方案', () => {
      addStage(tmpDir, 'stage-01');
      addStage(tmpDir, 'stage-02');

      createScheme(tmpDir, 'stage-01', '方案1');
      createScheme(tmpDir, 'stage-02', '方案2');

      const schemes = listSchemes(tmpDir);
      expect(schemes).toHaveLength(2);

      // 验证阶段区分
      const stage1Schemes = schemes.filter((s) => s.stage === 'stage-01');
      const stage2Schemes = schemes.filter((s) => s.stage === 'stage-02');
      expect(stage1Schemes).toHaveLength(1);
      expect(stage2Schemes).toHaveLength(1);
    });

    it('无方案时应返回空数组', () => {
      addStage(tmpDir, 'stage-01');

      const schemes = listSchemes(tmpDir, 'stage-01');
      expect(schemes).toEqual([]);
    });

    it('plan 目录不存在时应返回空数组', () => {
      const schemes = listSchemes(tmpDir);
      expect(schemes).toEqual([]);
    });
  });

  describe('op-006 renameScheme（B6）', () => {
    it('无首行模式 → 头部插入标题行，其余内容保留', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', 'T');
      const filePath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops', 'op-001.md');
      writeFileSync(filePath, '正文第一行\n第二行\n', 'utf-8');

      const r = renameScheme(tmpDir, 'stage-01', 'op-001', '新标题');

      expect(r.renamed).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(content.startsWith('# op-001：新标题\n\n正文第一行')).toBe(true);
    });

    it('标题未变 → title-unchanged 且不写盘', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', '同标题');
      const filePath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops', 'op-001.md');
      const before = readFileSync(filePath, 'utf-8');

      const r = renameScheme(tmpDir, 'stage-01', 'op-001', '同标题');

      expect(r.reason).toBe('title-unchanged');
      expect(readFileSync(filePath, 'utf-8')).toBe(before);
    });

    it('历史命名 op-002_旧标题.md → 首行更新且文件名不变（A5）', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', 'T'); // 注册 op-001（占号 1）
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      const mgr = new FlowManager(tmpDir);
      mgr.getData()!.stages['v1.0.0-stage-01'].ops['op-002'] = {
        id: 'op-002', title: '旧', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3,
        checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' },
      } as never;
      mgr.save();
      const legacyPath = join(opsDir, 'op-002_旧标题.md');
      writeFileSync(legacyPath, '# op-002：旧标题\n\n内容\n', 'utf-8');

      const r = renameScheme(tmpDir, 'stage-01', 'op-002', '新标题');

      expect(r.renamed).toBe(true);
      expect(existsSync(legacyPath)).toBe(true); // 文件名不变
      expect(readFileSync(legacyPath, 'utf-8').split('\n')[0]).toBe('# op-002：新标题');
    });
  });
});

// ═══════════════════════════════════════
// stage-52 op-013：双键回退范式固化（REV-007 T3）
// 同名短名键 + 全名键并存 → scheme 三函数一律作用于全名键，短名键逐字节不变
// ═══════════════════════════════════════

describe('REV-007 双键回退固化（stage-52 op-013）', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-scheme-op013-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  const flowPath = () => join(tmpDir, '.openfeel', 'flow.json');
  const templatePath = () => join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops', 'op-001.md');

  /** 构造 op 对象（checkpoints 全 pending） */
  function mkOp(opId: string, state: string, title: string) {
    return {
      id: opId, title, state, assignee: 'x', attempts: 0, max_attempts: 3,
      checkpoints: {
        plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' },
        review: 'pending', test: 'pending',
      },
    };
  }

  /**
   * 构造「短名键 stage-01」与「全名键 v1.0.0-stage-01」并存的双键 flow.json。
   * 全名键经 createScheme 注册（含模板文件）；短名键手工注入 sentinel op。
   * @param fullState 全名键 op-001 的 state
   * @param shortState 短名键 op-001 的 state
   * @returns 短名键注入后的 JSON 字符串（供逐字节比对）
   */
  function setupBothKeys(fullState: string, shortState = 'pending'): string {
    FlowManager.initFlow(tmpDir);
    addStage(tmpDir, 'v1.0.0-stage-01');
    createScheme(tmpDir, 'stage-01', '目标标题'); // 注册全名键 op-001 + 写模板文件
    const mgr = new FlowManager(tmpDir);
    const fullOp = mgr.getData()!.stages['v1.0.0-stage-01'].ops['op-001'];
    fullOp.state = fullState as never;
    mgr.getData()!.stages['stage-01'] = {
      name: 'stage-01', phase: 'plan_pending', status: 'planned', deps: [],
      ops: { 'op-001': mkOp('op-001', shortState, '短名哨兵') },
    } as never;
    mgr.save();
    return JSON.stringify(JSON.parse(readFileSync(flowPath(), 'utf-8')).stages['stage-01']);
  }

  it('T3: removeScheme 作用于全名键，短名键逐字节不变', () => {
    const shortBefore = setupBothKeys('pending');

    const r = removeScheme(tmpDir, 'stage-01', 'op-001');

    expect(r.removed).toBe(true);
    const data = JSON.parse(readFileSync(flowPath(), 'utf-8'));
    expect(data.stages['v1.0.0-stage-01'].ops['op-001']).toBeUndefined();
    expect(JSON.stringify(data.stages['stage-01'])).toBe(shortBefore);
  });

  it('T3: publishScheme 作用于全名键，短名键逐字节不变', () => {
    const shortBefore = setupBothKeys('draft');
    // 覆盖模板为「已填充」（无空模板标记）
    writeFileSync(templatePath(), '# op-001：目标标题\n\n- [x] 已完成\n', 'utf-8');

    const r = publishScheme(tmpDir, 'stage-01', 'op-001');

    expect(r.published).toBe(true);
    const data = JSON.parse(readFileSync(flowPath(), 'utf-8'));
    expect(data.stages['v1.0.0-stage-01'].ops['op-001'].state).toBe('pending');
    expect(JSON.stringify(data.stages['stage-01'])).toBe(shortBefore);
  });

  it('T3: renameScheme 作用于全名键，短名键逐字节不变', () => {
    const shortBefore = setupBothKeys('pending');
    writeFileSync(templatePath(), '# op-001：目标标题\n\n内容\n', 'utf-8');

    const r = renameScheme(tmpDir, 'stage-01', 'op-001', '新标题');

    expect(r.renamed).toBe(true);
    const data = JSON.parse(readFileSync(flowPath(), 'utf-8'));
    expect(data.stages['v1.0.0-stage-01'].ops['op-001'].title).toBe('新标题');
    expect(JSON.stringify(data.stages['stage-01'])).toBe(shortBefore);
  });
});
