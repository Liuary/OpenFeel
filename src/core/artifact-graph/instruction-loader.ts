/**
 * 指令加载器 — 为指定 artifact 生成结构化 XML 指令
 * 
 * 核心职责：
 * 1. 从 Schema 中提取 artifact 的依赖、产出、模板等信息
 * 2. 注入项目上下文（config.yaml）、默认规则约束、依赖状态
 * 3. 生成 XML 格式的结构化指令（供 AI Agent 消费）
 * 4. 提供 JSON 格式备选输出
 */
import type { Schema, Artifact } from '../schema.js';
import { ArtifactGraph } from './graph.js';
import { detectCompletedArtifacts } from './state.js';
import { readConfig, type Config } from '../config.js';
import { FlowManager } from '../flow-manager.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── XML 工具函数 ────────────────────────────────────────────────

/** XML 特殊字符转义映射 */
const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * 对 XML 文本内容中的特殊字符进行转义
 * 防止指令文本中含 XML 保留字符导致格式破坏
 */
function xmlEscape(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => XML_ESCAPE_MAP[ch] ?? ch);
}

/** 默认三条规则约束，后续可从 schema.yaml 的 rules 字段扩展 */
const DEFAULT_RULES: string[] = [
  '遵循 TypeScript 编码规范',
  '产物生成到 generates 字段指定的路径',
  '完成所有 hard 依赖后再开始当前 artifact',
];

// ─── 子块生成 ────────────────────────────────────────────────────

/**
 * 生成 <project_context> 块
 * 包含技术栈、工作区状态、项目名和 config.yaml 关键配置
 */
function generateProjectContext(config: Config): string {
  const techStack = 'TypeScript';
  const workspace = '.openfeel/ 工作区已初始化';
  const project = 'OpenFeel';

  // 提取关键配置项摘要
  const configParts: string[] = [];
  if (config.execution_mode) {
    configParts.push(`执行模式: ${config.execution_mode}`);
  }
  if (config.auto_advance) {
    configParts.push(`自动推进: ${config.auto_advance}`);
  }
  if (config.test_enabled !== undefined) {
    configParts.push(`测试启用: ${config.test_enabled}`);
  }
  if (config.merge_mode) {
    configParts.push(`合并模式: ${config.merge_mode}`);
  }
  const configSummary = configParts.length > 0
    ? xmlEscape(configParts.join('; '))
    : '无特殊配置';

  return [
    `  <project_context>`,
    `    <tech_stack>${techStack}</tech_stack>`,
    `    <workspace>${workspace}</workspace>`,
    `    <project>${project}</project>`,
    `    <config>${configSummary}</config>`,
    `  </project_context>`,
  ].join('\n');
}

/**
 * 生成 <rules> 块
 * 包含默认规则和 Schema 级别的规则（如存在）
 */
function generateRulesBlock(schema: Schema): string {
  // 合并默认规则与 Schema 规则（type inference: Schema 类型暂未定义 rules 字段）
  const rules: string[] = [...DEFAULT_RULES];
  const schemaRules = (schema as Record<string, unknown>).rules;
  if (Array.isArray(schemaRules)) {
    for (const r of schemaRules) {
      if (typeof r === 'string') {
        rules.push(r);
      }
    }
  }

  const ruleLines = rules.map((r) => `    <rule>${xmlEscape(r)}</rule>`);
  return ['  <rules>', ...ruleLines, '  </rules>'].join('\n');
}

/**
 * 生成 <dependencies> 块
 * 遍历当前 artifact 的所有 hard 依赖，标注其完成状态（done/pending）
 */
function generateDependenciesBlock(
  artifact: Artifact,
  schema: Schema,
  completed: Set<string>
): string {
  // 收集 target artifact 的所有 hard 依赖 ID
  const hardDepIds = collectHardDepIds(artifact);

  if (hardDepIds.length === 0) {
    return '  <dependencies></dependencies>';
  }

  const depLines: string[] = [];
  for (const depId of hardDepIds) {
    const depArtifact = schema.artifacts.find((a) => a.id === depId);
    const status = completed.has(depId) ? 'done' : 'pending';
    const path = depArtifact ? xmlEscape(depArtifact.generates) : '(未知)';
    const desc = depArtifact?.description
      ? xmlEscape(depArtifact.description)
      : '(无描述)';

    depLines.push(
      `    <dependency id="${xmlEscape(depId)}" status="${status}">`,
      `      <path>${path}</path>`,
      `      <description>${desc}</description>`,
      `    </dependency>`
    );
  }

  return ['  <dependencies>', ...depLines, '  </dependencies>'].join('\n');
}

/**
 * 生成 <unlocks> 描述
 * 通过 ArtifactGraph 找出哪些 artifact 依赖当前 artifact
 */
function generateUnlocks(
  artifactId: string,
  graph: ArtifactGraph,
  schema: Schema
): string {
  // 通过 getBlocked 找出所有被阻塞的 artifact，筛选缺少当前 artifactId 的
  const empty = new Set<string>();
  const blocked = graph.getBlocked(empty);
  const unlockedByCurrent: string[] = [];

  for (const info of blocked.blocked) {
    if (info.missingDeps.includes(artifactId)) {
      unlockedByCurrent.push(info.artifactId);
    }
  }

  // 跳过当前 artifact 自身
  const others = unlockedByCurrent.filter((id) => id !== artifactId);

  if (others.length === 0) {
    return '  <unlocks>完成此 artifact 后暂无直接解锁的下游 artifact</unlocks>';
  }

  // 获取下游 artifact 描述
  const descList = others.map((id) => {
    const a = schema.artifacts.find((art) => art.id === id);
    return a?.description ? `${id}（${a.description}）` : id;
  });

  return `  <unlocks>${xmlEscape(`Completing this artifact enables: ${descList.join(', ')}`)}</unlocks>`;
}

/**
 * 收集 artifact 的所有 hard 依赖 ID（复用 ArtifactGraph 内部逻辑）
 */
function collectHardDepIds(artifact: Artifact): string[] {
  const hardDeps: string[] = [];

  // dependsOn 简写：全部视为 hard
  if (artifact.dependsOn) {
    hardDeps.push(...artifact.dependsOn);
  }

  // requires 数组：按 type 过滤
  if (artifact.requires) {
    for (const dep of artifact.requires) {
      if (dep.type !== 'soft') {
        hardDeps.push(dep.artifact);
      }
    }
  }

  return [...new Set(hardDeps)];
}

/**
 * 为 instruction 字段为空时自动生成分步指导
 */
function generateFallbackInstruction(artifact: Artifact): string {
  const name = artifact.description ?? artifact.id;
  const output = artifact.generates;
  return [
    `1. 理解 ${name} 的需求和目标`,
    `2. 检查前置依赖产物是否已就绪`,
    `3. 根据规范编写代码或文档`,
    `4. 将产物输出到 ${output}`,
    `5. 验证产物完整性和正确性`,
  ].join('\n');
}

// ─── 公开 API ────────────────────────────────────────────────────

/**
 * 为指定 artifact 生成 XML 格式的结构化指令
 * 
 * @param schema - 工作流 Schema
 * @param changeName - 变更名称
 * @param artifactId - 目标 artifact ID
 * @param projectPath - 项目根路径
 * @param completed - 可选的已完成 artifact ID 集合（用于测试/缓存），不传则自动扫描文件系统
 * @returns XML 格式的指令文本
 * @throws 找不到 artifact 或 Schema 校验失败时抛出异常
 */
export async function generateInstructions(
  schema: Schema,
  changeName: string,
  artifactId: string,
  projectPath: string,
  completed?: Set<string>
): Promise<string> {
  // 1. 校验 artifact 存在
  const artifact = schema.artifacts.find((a) => a.id === artifactId);
  if (!artifact) {
    throw new Error(
      `Schema "${schema.name}" 中找不到 artifact "${artifactId}"`
    );
  }

  // 2. 检测已完成的 artifact（文件系统扫描）
  const actualCompleted = completed ?? await detectCompletedArtifacts(schema, projectPath);

  // 3. 读取项目配置
  const config = readConfig(projectPath);

  // 4. 验证 flow.json 存在（项目已初始化）
  const flowPath = resolve(projectPath, '.openfeel', 'flow.json');
  if (!existsSync(flowPath)) {
    // flow.json 不存在时仅警告，不阻断指令生成
    // FlowManager 会在构造函数中记录数据未加载
  }
  // 初始化 FlowManager（验证流水线初始化状态）
  const flowManager = new FlowManager(projectPath);
  const flowInitialized = flowManager.isLoaded();

  // 5. 构建依赖图
  const graph = new ArtifactGraph(schema);

  // 6. 构建任务描述
  const taskDesc = artifact.instruction ?? artifact.description ?? '请完成此 artifact';

  // 7. 构建各 XML 块
  const projectCtx = generateProjectContext(config);
  const rulesBlock = generateRulesBlock(schema);
  const depsBlock = generateDependenciesBlock(artifact, schema, actualCompleted);
  const output = xmlEscape(artifact.generates);
  const instruction = artifact.instruction
    ? xmlEscape(artifact.instruction)
    : xmlEscape(generateFallbackInstruction(artifact));
  const template = artifact.template
    ? xmlEscape(artifact.template)
    : '(无模板)';
  const unlocks = generateUnlocks(artifactId, graph, schema);

  // 8. 拼接完整 XML
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<artifact id="${xmlEscape(artifactId)}" change="${xmlEscape(changeName)}" schema="${xmlEscape(schema.name)}">`,
    `  <task>${xmlEscape(taskDesc)}</task>`,
    projectCtx,
    rulesBlock,
    depsBlock,
    `  <output>${output}</output>`,
    `  <instruction>${instruction}</instruction>`,
    `  <template>${template}</template>`,
    unlocks,
    `</artifact>`,
  ];

  return lines.join('\n') + '\n';
}

/**
 * 为指定 artifact 生成 JSON 格式的结构化指令
 * 返回与 XML 标签对应的 JS 对象
 * 
 * @param schema - 工作流 Schema
 * @param changeName - 变更名称
 * @param artifactId - 目标 artifact ID
 * @param projectPath - 项目根路径
 * @param completed - 可选的已完成 artifact ID 集合
 * @returns JSON 对象
 */
export async function generateInstructionsJson(
  schema: Schema,
  changeName: string,
  artifactId: string,
  projectPath: string,
  completed?: Set<string>
): Promise<object> {
  const artifact = schema.artifacts.find((a) => a.id === artifactId);
  if (!artifact) {
    throw new Error(
      `Schema "${schema.name}" 中找不到 artifact "${artifactId}"`
    );
  }

  const actualCompleted = completed ?? await detectCompletedArtifacts(schema, projectPath);
  const config = readConfig(projectPath);
  const graph = new ArtifactGraph(schema);

  // 依赖列表
  const hardDepIds = collectHardDepIds(artifact);
  const dependencies = hardDepIds.map((depId) => {
    const depArtifact = schema.artifacts.find((a) => a.id === depId);
    return {
      id: depId,
      status: actualCompleted.has(depId) ? 'done' : 'pending',
      path: depArtifact?.generates ?? '(未知)',
      description: depArtifact?.description ?? '(无描述)',
    };
  });

  // 解锁的下游 artifact
  const empty = new Set<string>();
  const blocked = graph.getBlocked(empty);
  const unlockedByCurrent: string[] = [];
  for (const info of blocked.blocked) {
    if (info.missingDeps.includes(artifactId)) {
      unlockedByCurrent.push(info.artifactId);
    }
  }
  const others = unlockedByCurrent.filter((id) => id !== artifactId);
  const unlocks = others.map((id) => {
    const a = schema.artifacts.find((art) => art.id === id);
    return { id, description: a?.description ?? null };
  });

  // 规则列表
  const rules: string[] = [...DEFAULT_RULES];
  const schemaRules = (schema as Record<string, unknown>).rules;
  if (Array.isArray(schemaRules)) {
    for (const r of schemaRules) {
      if (typeof r === 'string') {
        rules.push(r);
      }
    }
  }

  return {
    artifact: {
      id: artifactId,
      change: changeName,
      schema: schema.name,
    },
    task: artifact.instruction ?? artifact.description ?? '请完成此 artifact',
    project_context: {
      tech_stack: 'TypeScript',
      workspace: '.openfeel/ 工作区已初始化',
      project: 'OpenFeel',
      config: {
        execution_mode: config.execution_mode ?? null,
        auto_advance: config.auto_advance ?? null,
        test_enabled: config.test_enabled ?? null,
        merge_mode: config.merge_mode ?? null,
      },
    },
    rules,
    dependencies,
    output: artifact.generates,
    instruction: artifact.instruction ?? generateFallbackInstruction(artifact),
    template: artifact.template ?? null,
    unlocks,
  };
}
