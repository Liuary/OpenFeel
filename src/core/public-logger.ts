/**
 * PublicLogger — 公共日志写入模块
 * 负责将团队级重要事件写入 .openfeel/log/ 公共日志目录，
 * 实现完整的审计追踪链。
 *
 * 写入规则（符合 AGENTS.md 定义的「日志目录」规范）：
 * - 写入路径：.openfeel/log/{yyyy}/{MM}/{dd}/{date}-{username}-{NNN}.md
 * - NNN 为当日 3 位递增序号（001, 002, ...），基于当日已有日志文件数 + 1
 * - 自动维护 day_index.md（每日索引）、根级 index.md + log.md
 * - 异步乐观：写入失败仅 console.warn，不阻塞流水线推进
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

/** 里程碑事件 */
export interface MilestoneEvent {
  action: string;
  stageId?: string;
  durationMs?: number;
  finalPhase?: string;
  [key: string]: unknown;
}

/** 日志事件详情 */
export interface LogEventDetail {
  /** 操作类型（如 advance_phase, attempt_pass, review_added 等） */
  action: string;
  /** 关联的操作 ID（可选） */
  opId?: string | null;
  /** 变更前状态（可选） */
  from?: string;
  /** 变更后状态（可选） */
  to?: string;
  /** 其他补充信息 */
  extra?: Record<string, unknown>;
}

/**
 * PublicLogger 单例类
 * 负责写入公共日志并维护索引文件。
 * 构造时从 .openfeel/.info.json 加载用户名。
 */
export class PublicLogger {
  private static instance: PublicLogger | null = null;
  private projectPath: string;
  private username: string;

  private constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.username = this.loadUsername();
  }

  /**
   * 获取或创建 PublicLogger 单例
   * @param projectPath 项目根路径
   */
  static getInstance(projectPath: string): PublicLogger {
    if (!PublicLogger.instance) {
      PublicLogger.instance = new PublicLogger(projectPath);
    }
    return PublicLogger.instance;
  }

  /**
   * 重置单例（仅供测试使用）
   */
  static resetInstance(): void {
    PublicLogger.instance = null;
  }

  // ── 公开方法 ──

  /**
   * 记录状态变更事件（advancePhase / recordAttempt）
   * @param detail 变更详情
   */
  logPhaseChange(detail: LogEventDetail): void {
    this.writeLog('状态变更', detail);
  }

  /**
   * 记录审查事件（addReview / addAutoFixReview）
   * @param detail 审查详情
   */
  logReviewEvent(detail: LogEventDetail): void {
    this.writeLog('审查事件', detail);
  }

  /**
   * 记录测试事件
   * @param detail 测试详情
   */
  logTestEvent(detail: LogEventDetail): void {
    this.writeLog('测试事件', detail);
  }

  /**
   * 记录里程碑事件（阶段完成、测试通过、归档完成等）
   * 此类重要事件逐条记录，不参与批量聚合
   */
  logMilestone(title: string, event: MilestoneEvent): void {
    // 确保 title 参数被传递到日志内容的 extra.title 字段中
    this.writeLog('里程碑', { ...event, action: event.action, extra: { title } } as LogEventDetail);
  }

  // ═══ 私有方法 ═══

  /** 从 .openfeel/.info.json 加载用户名 */
  private loadUsername(): string {
    try {
      const infoPath = resolve(this.projectPath, '.openfeel', '.info.json');
      if (existsSync(infoPath)) {
        const raw = readFileSync(infoPath, 'utf-8');
        const info = JSON.parse(raw) as Record<string, unknown>;
        if (info.user && typeof info.user === 'string') {
          return info.user;
        }
      }
    } catch {
      // 加载失败使用默认值
    }
    return 'unknown';
  }

  /** 写入日志并维护索引（乐观操作） */
  private writeLog(eventType: string, detail: LogEventDetail): void {
    try {
      const now = new Date();
      const dateDir = this.ensureDateDir(now);
      const nnn = this.computeNextNnn(dateDir, now);
      const fileName = this.buildFileName(now, nnn);
      const filePath = resolve(dateDir, fileName);

      // 写入日志文件
      const content = this.buildLogContent(now, eventType, detail, fileName);
      writeFileSync(filePath, content, 'utf-8');

      // 维护三级索引
      this.updateDayIndex(dateDir, fileName, now, getShortDesc(detail, eventType));
      this.updateRootIndex(now, getShortDesc(detail, eventType));
      this.updateLogMd(fileName, now, getShortDesc(detail, eventType));
    } catch (err) {
      console.warn(`[WARN] 公共日志写入失败: ${(err as Error).message}`);
    }
  }

  /** 确保年/月/日目录存在，返回日目录路径 */
  private ensureDateDir(now: Date): string {
    const yyyy = now.getFullYear().toString();
    const MM = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');

    const logRoot = resolve(this.projectPath, '.openfeel', 'log');
    const yearDir = resolve(logRoot, yyyy);
    const monthDir = resolve(yearDir, MM);
    const dayDir = resolve(monthDir, dd);

    // 确保各级目录存在
    for (const dir of [logRoot, yearDir, monthDir, dayDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
    return dayDir;
  }

  /** 计算当日的下一个 NNN 值（当日已有日志文件数 + 1） */
  private computeNextNnn(dayDir: string, now: Date): number {
    const datePrefix = formatDate(now);
    try {
      const entries = readdirSync(dayDir);
      // 匹配文件名模式 {datePrefix}-{username}-{NNN}.md
      const userPrefix = `${datePrefix}-${this.username}-`;
      let maxNnn = 0;
      for (const entry of entries) {
        if (entry.startsWith(userPrefix) && entry.endsWith('.md')) {
          const nnnStr = entry.slice(userPrefix.length, -3); // 去掉 ".md" 后缀
          const nnn = parseInt(nnnStr, 10);
          if (!isNaN(nnn) && nnn > maxNnn) {
            maxNnn = nnn;
          }
        }
      }
      return maxNnn + 1;
    } catch {
      return 1;
    }
  }

  /** 构建日志文件名 yyyy-mm-dd-{username}-NNN.md */
  private buildFileName(now: Date, nnn: number): string {
    const nnnStr = nnn.toString().padStart(3, '0');
    return `${formatDate(now)}-${this.username}-${nnnStr}.md`;
  }

  /** 构建日志文件内容 */
  private buildLogContent(
    now: Date,
    eventType: string,
    detail: LogEventDetail,
    fileName: string,
  ): string {
    const lines: string[] = [
      `# ${fileName.replace('.md', '')}`,
      '',
      `- **时间**：${now.toISOString()}`,
      `- **操作者**：${this.username}`,
      `- **事件类型**：${eventType}`,
      `- **操作**：${detail.action}`,
    ];

    if (detail.opId) {
      lines.push(`- **关联操作**：${detail.opId}`);
    }
    if (detail.from !== undefined) {
      lines.push(`- **变更前**：${detail.from}`);
    }
    if (detail.to !== undefined) {
      lines.push(`- **变更后**：${detail.to}`);
    }

    // 额外信息
    if (detail.extra && Object.keys(detail.extra).length > 0) {
      lines.push('');
      lines.push('## 补充信息');
      for (const [key, value] of Object.entries(detail.extra)) {
        lines.push(`- **${key}**：${String(value)}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  /** 更新当日 day_index.md */
  private updateDayIndex(
    dayDir: string,
    fileName: string,
    now: Date,
    desc: string,
  ): void {
    const indexPath = resolve(dayDir, 'day_index.md');
    const dateStr = formatDate(now);
    const headerContent = `# ${dateStr}\n\n## 日志列表\n| 文件 | 操作者 | 描述 |\n|------|--------|------|`;

    if (!existsSync(indexPath)) {
      // 新建索引
      const entry = `\n| [${fileName}](${fileName}) | ${this.username} | ${desc} |\n`;
      writeFileSync(indexPath, headerContent + entry, 'utf-8');
      return;
    }

    // 追加条目
    let content = readFileSync(indexPath, 'utf-8');
    // 避免重复追加（幂等性：检查是否已存在同名条目）
    if (content.includes(fileName)) {
      return;
    }
    // 去掉末尾空白后追加
    content = content.replace(/\s*$/, '');
    content += `\n| [${fileName}](${fileName}) | ${this.username} | ${desc} |\n`;
    writeFileSync(indexPath, content, 'utf-8');
  }

  /** 更新根级 index.md（日期索引） */
  private updateRootIndex(now: Date, desc: string): void {
    const indexPath = resolve(this.projectPath, '.openfeel', 'log', 'index.md');
    const dateStr = formatDate(now);
    const yyyy = now.getFullYear().toString();
    const MM = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const dayRelPath = `${yyyy}/${MM}/${dd}/day_index.md`;
    const entry = `| [${dateStr}](${dayRelPath}) | ${desc} |`;

    if (!existsSync(indexPath)) {
      const content = `# 日志索引\n\n## 日期索引\n\n| 日期 | 摘要 |\n|------|------|\n${entry}\n`;
      writeFileSync(indexPath, content, 'utf-8');
      return;
    }

    let content = readFileSync(indexPath, 'utf-8');
    // 检查该日期是否已存在，存在则更新摘要；否则插入新行
    if (content.includes(`[${dateStr}]`)) {
      // 日期已存在，不重复添加
      return;
    }

    // 在表格末尾追加（在下一个 ## 或文件末尾之前）
    const tableEndMatch = content.match(/\| [^\n]+\n(?=\n|##|$)/);
    if (tableEndMatch) {
      const insertPos = content.indexOf(tableEndMatch[0]) + tableEndMatch[0].length;
      content = content.slice(0, insertPos) + entry + '\n' + content.slice(insertPos);
    } else {
      content = content.replace(/\s*$/, '') + '\n' + entry + '\n';
    }
    writeFileSync(indexPath, content, 'utf-8');
  }

  /** 更新根级 log.md（最近 30 条摘要，倒序插入顶部） */
  private updateLogMd(fileName: string, now: Date, desc: string): void {
    const logPath = resolve(this.projectPath, '.openfeel', 'log', 'log.md');
    const yyyy = now.getFullYear().toString();
    const MM = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const fileRelPath = `${yyyy}/${MM}/${dd}/${fileName}`;
    const entry = `| [${fileName}](${fileRelPath}) | ${this.username} | ${desc} |`;

    if (!existsSync(logPath)) {
      const content = `# 最近日志\n\n| 文件 | 用户 | 描述 |\n|------|------|------|\n${entry}\n`;
      writeFileSync(logPath, content, 'utf-8');
      return;
    }

    let content = readFileSync(logPath, 'utf-8');

    // 避免重复追加
    if (content.includes(fileName)) {
      return;
    }

    // 找到表格头部后的第一行，插入新条目
    const tableHeaderEnd = content.indexOf('|------|------|------|');
    if (tableHeaderEnd === -1) {
      // 格式异常，重新初始化
      const newContent = `# 最近日志\n\n| 文件 | 用户 | 描述 |\n|------|------|------|\n${entry}\n`;
      writeFileSync(logPath, newContent, 'utf-8');
      return;
    }

    const insertPos = tableHeaderEnd + '|------|------|------|'.length;
    const before = content.slice(0, insertPos);
    let after = content.slice(insertPos);

    // 在前面插入新条目（倒序：最新在上）
    after = '\n' + entry + after;

    // 截断到最近 30 条
    const lines = after.split('\n');
    const entryLines: string[] = [];
    const maxEntries = 30;
    let count = 0;
    for (const line of lines) {
      if (line.startsWith('| [')) {
        count++;
        if (count <= maxEntries) {
          entryLines.push(line);
        }
        // 超过 maxEntries 的丢弃
      } else {
        entryLines.push(line);
      }
    }

    // 确保末尾有换行
    const newContent = before + entryLines.join('\n').replace(/\n*$/, '\n');
    writeFileSync(logPath, newContent, 'utf-8');
  }
}

// ── 辅助函数 ──

/** 格式化日期为 yyyy-mm-dd */
function formatDate(date: Date): string {
  const yyyy = date.getFullYear().toString();
  const MM = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return `${yyyy}-${MM}-${dd}`;
}

/** 从 LogEventDetail 生成简短描述 */
function getShortDesc(detail: LogEventDetail, eventType: string): string {
  const parts: string[] = [];

  if (detail.opId) {
    parts.push(detail.opId);
  }

  // 根据操作类型生成可读描述
  switch (detail.action) {
    case 'advance_phase':
      parts.push('阶段推进');
      if (detail.from && detail.to) {
        parts.push(`${detail.from} → ${detail.to}`);
      }
      break;
    case 'attempt_pass':
      parts.push('执行通过');
      break;
    case 'attempt_fail_retry':
      parts.push('执行失败，重试中');
      break;
    case 'attempt_fail_exhausted':
      parts.push('执行失败，重试耗尽');
      break;
    case 'auto_fix_review':
      parts.push('自动修复审查');
      break;
    case 'stage_completed':
      if (detail.extra?.title) {
        parts.push(String(detail.extra.title));
      } else {
        parts.push('阶段完成');
      }
      break;
    default:
      parts.push(detail.action);
      break;
  }

  return parts.join(' ') || eventType;
}
