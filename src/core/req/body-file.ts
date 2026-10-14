/**
 * 需求正文文件原语 — 正文路径单点与骨架机械铺
 *
 * 职责：`.openfeel/requirements/REQ-NNN.md` 正文文件（人读副本）的路径派生与骨架写入。
 * 正交声明：路径全由 `projectPath` 参数传入，零全局路径依赖；不依赖归档层 / 不引用工作流模式字段。
 * 唯一 IO 点：骨架经 `atomicWriteFileSync` 落盘（目录按需 mkdir 幂等创建）。
 */
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import type { RequirementData } from './types.js';

/** 需求正文目录：{projectPath}/.openfeel/requirements（**不纳入 WORKSPACE_DIRS**，按需 mkdir 幂等创建——与归档目录同口径） */
export function getRequirementsDir(projectPath: string): string {
  return join(projectPath, '.openfeel', 'requirements');
}

/** 正文**存储**相对路径（恒 POSIX 正斜杠，跨平台一致；禁 path.join——Windows 产反斜杠） */
export function getRequirementBodyRelPath(id: string): string {
  return `.openfeel/requirements/${id}.md`;
}

/** 正文**文件系统**路径（单点；FS 访问用原生分隔符） */
export function getRequirementBodyPath(projectPath: string, id: string): string {
  return join(getRequirementsDir(projectPath), `${id}.md`);
}

/**
 * 渲染需求正文骨架（裁定 6 模板逐字）。
 * 状态取当前值（参数化：req add 恒 draft；req split 子需求初值 scheduled）；`target_version` 缺省渲染为 `（未指定）`。
 */
function renderRequirementBodySkeleton(req: RequirementData): string {
  const targetVersion = req.target_version !== undefined && req.target_version !== ''
    ? req.target_version
    : '（未指定）';
  return [
    `# ${req.id}：${req.title}`,
    '',
    '> 本文件为需求正文（人读副本，由 openfeel req 机械铺骨架）。**机读权威恒为 `.openfeel/flow.json` 的 `requirements` 条目**；两者不一致时以 flow.json 为准。下方状态为创建时快照，不追写实时状态。',
    '',
    '## 状态',
    '',
    `${req.status}（创建时快照；以 flow.json 为准）`,
    '',
    '## 摘要',
    '',
    '（待补充）',
    '',
    '## 目标与验收',
    '',
    '（待补充）',
    '',
    '## 预估版本',
    '',
    targetVersion,
    '',
    '## 父需求',
    '',
    req.parent_id ?? '（无）',
    '',
    '## 关联阶段',
    '',
    '（以 flow.json 的 `stages[*].requirement_id` 为准；此处可人工补充说明）',
    '',
    '## 变更记录',
    '',
    `- ${req.created_at} 创建（${req.id}，初始状态 ${req.status}）`,
    '',
  ].join('\n');
}

/**
 * 机械铺需求正文骨架（人读副本）。
 * - mkdir 幂等；atomicWriteFileSync（backup 缺省 false）
 * - 目标文件已存在 → **no-op 不覆盖**（保留人工补充内容）
 * - 恒将 req.body_path 设为本函数单点派生的 POSIX 相对路径（传入须为 addRequirement 返回的本体）
 * @returns 目标文件的绝对路径
 */
export function writeRequirementBodySkeleton(projectPath: string, req: RequirementData): string {
  const dir = getRequirementsDir(projectPath);
  mkdirSync(dir, { recursive: true });                       // 幂等
  const filePath = getRequirementBodyPath(projectPath, req.id);
  req.body_path = getRequirementBodyRelPath(req.id);         // 单点赋值（no-op 路径亦保证一致）
  if (existsSync(filePath)) { return filePath; }             // 已存在 → 不覆盖
  atomicWriteFileSync(filePath, renderRequirementBodySkeleton(req));
  return filePath;
}
