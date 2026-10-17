/**
 * 分期大纲管理
 * 负责 .openfeel/roadmap/ 下的版本大纲文件创建与读取
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { atomicWriteFileSync } from '../fs/atomic-write.js';

/** 分期大纲 */
export interface Roadmap {
  version: string;
  /** 相对路径 .openfeel/roadmap/v{version}.md */
  path: string;
}

/** 规范化版本号：去掉用户可能输入的前导 v */
function normalizeVersion(version: string): string {
  return version.replace(/^v/, '');
}

/** 里程碑条目（JSON 契约固定键序：title, theme, stage, deliverable） */
export interface RoadmapMilestone {
  title: string | null;
  theme: string | null;
  stage: string | null;
  deliverable: string | null;
}

/** 里程碑读取结果 */
export interface RoadmapMilestones {
  /** 归一化后的版本号（无前导 v）；未传版本时为 null */
  version: string | null;
  milestones: RoadmapMilestone[];
}

/**
 * 解析 roadmap 文档 `## 里程碑` 小节中的表格（只读纯函数）。
 * 表头驱动：`里程碑`→title、`主题`→theme、`阶段`→stage、`交付物`→deliverable；
 * 兼容历史 3 列格式（无主题 → theme:null），缺列一律 null。
 * 无该小节 / 无表格 / 占位文案 → []（不抛错）。
 * @param content roadmap Markdown 全文
 */
export function parseMilestones(content: string): RoadmapMilestone[] {
  const lines = content.split('\n');
  const sectionStart = lines.findIndex((line) => /^##\s+里程碑\s*$/.test(line.trim()));
  if (sectionStart === -1) {
    return [];
  }

  // 收集本节内的表格行（遇到下一个二级标题即结束）
  const sectionLines: string[] = [];
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    sectionLines.push(line);
  }

  // 表头驱动：定位含「里程碑」与「阶段」的表头行
  const headerIdx = sectionLines.findIndex(
    (line) => line.trim().startsWith('|') && line.includes('里程碑') && line.includes('阶段'),
  );
  if (headerIdx === -1) {
    return [];
  }

  const splitCells = (line: string): string[] => {
    const parts = line.split('|').map((c) => c.trim());
    // 去掉首尾由 `|` 产生的空单元
    if (parts.length > 0 && parts[0] === '') {
      parts.shift();
    }
    if (parts.length > 0 && parts[parts.length - 1] === '') {
      parts.pop();
    }
    return parts;
  };

  const headers = splitCells(sectionLines[headerIdx]);
  const indexOf = (label: string): number => headers.findIndex((h) => h === label);
  const col = {
    title: indexOf('里程碑'),
    theme: indexOf('主题'),
    stage: indexOf('阶段'),
    deliverable: indexOf('交付物'),
  };

  const pick = (cells: string[], idx: number): string | null => {
    if (idx < 0 || idx >= cells.length) {
      return null;
    }
    const value = cells[idx].trim();
    return value === '' ? null : value;
  };

  const milestones: RoadmapMilestone[] = [];
  for (let i = headerIdx + 1; i < sectionLines.length; i += 1) {
    const line = sectionLines[i].trim();
    if (!line.startsWith('|')) {
      continue;
    }
    const cells = splitCells(line);
    // 分隔行（--- / :---: 等）跳过（GFM 允许最少 1 个连字符的对齐写法）
    if (cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))) {
      continue;
    }
    // 空行（如 `| | |`）不构成里程碑
    if (cells.every((c) => c === '')) {
      continue;
    }
    milestones.push({
      title: pick(cells, col.title),
      theme: pick(cells, col.theme),
      stage: pick(cells, col.stage),
      deliverable: pick(cells, col.deliverable),
    });
  }
  return milestones;
}

/**
 * 读取指定版本的里程碑（只读）。
 * 不传版本 → { version:null, milestones:[] }（无单一文档可解析）；
 * 版本文件不存在 → 抛错（由命令层决定退出码与 envelope）。
 * @param projectPath 项目根路径
 * @param version 版本号（前导 v 可省略）
 */
export function readRoadmapMilestones(projectPath: string, version?: string): RoadmapMilestones {
  if (!version) {
    return { version: null, milestones: [] };
  }
  const ver = normalizeVersion(version);
  const filePath = join(resolve(projectPath, '.openfeel', 'roadmap'), `v${ver}.md`);
  if (!existsSync(filePath)) {
    throw new Error(`错误：大纲文件不存在 — v${ver}.md`);
  }
  return { version: ver, milestones: parseMilestones(readFileSync(filePath, 'utf-8')) };
}

/**
 * 创建分期大纲
 * 在 .openfeel/roadmap/ 下创建 v{version}.md 骨架文件
 */
export function createRoadmap(projectPath: string, version: string): void {
  const ver = normalizeVersion(version);
  const roadmapDir = resolve(projectPath, '.openfeel', 'roadmap');

  if (!existsSync(roadmapDir)) {
    mkdirSync(roadmapDir, { recursive: true });
  }

  const filePath = join(roadmapDir, `v${ver}.md`);

  if (existsSync(filePath)) {
    console.log(`大纲已存在: v${ver}.md`);
    return;
  }

  const content = `# 分期大纲 v${ver}

## 目标

> 待补充 — 描述本版本的总体目标

## 阶段划分

> 待补充 — 列出各阶段（stage-01, stage-02, ...）及简要说明

## 里程碑

> 待补充 — 关键里程碑和预期完成时间

## 备注

> 待补充
`;

  atomicWriteFileSync(filePath, content);
  console.log(`已创建分期大纲: v${ver}.md`);
}

/**
 * 显示分期大纲内容
 * @param version 不传则列出所有大纲文件
 */
export function showRoadmap(projectPath: string, version?: string): string {
  const roadmapDir = resolve(projectPath, '.openfeel', 'roadmap');

  if (!existsSync(roadmapDir)) {
    return '暂无分期大纲（.openfeel/roadmap/ 目录不存在）';
  }

  if (version) {
    const ver = normalizeVersion(version);
    const filePath = join(roadmapDir, `v${ver}.md`);
    if (!existsSync(filePath)) {
      // 文件不存在：core 层不直接 process.exit，抛错由命令层决定退出码（T10）
      throw new Error(`错误：大纲文件不存在 — v${ver}.md`);
    }
    return readFileSync(filePath, 'utf-8');
  }

  const files = readdirSync(roadmapDir).filter(
    (f) => f.startsWith('v') && f.endsWith('.md'),
  );

  if (files.length === 0) {
    return '暂无分期大纲文件';
  }

  return files.join('\n');
}