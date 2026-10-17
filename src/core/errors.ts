/**
 * CLI 稳定错误码表（v1.2.2-stage-95 op-002）
 *
 * 职责：提供 `code → kind → exitCode` 的**单一权威**映射，供命令层与测试共用。
 * 契约：`docs/json-contract.md` §3（13 行，逐行同源）；本文件为唯一实现来源，命令层不得硬编码 kind / exitCode。
 * 边界：仅定义分类，不承担输出控制（envelope / stderr 归 `src/commands/shared/errors.ts`）。
 */

/** 错误分类：预期拒绝 / 内部故障（分类权威；退出码为冗余信号） */
export type CliErrorKind = 'refusal' | 'internal';

/** CLI 退出码：0 成功 / 1 预期拒绝 / 2 并发写冲突 / 3 内部错误（后者为本版新增） */
export type CliExitCode = 0 | 1 | 2 | 3;

/** 单个错误码的完整规格（code / kind / exitCode 三列） */
export interface CliErrorSpec {
  code: CliErrorCode;
  kind: CliErrorKind;
  exitCode: CliExitCode;
}

/**
 * 13 个稳定错误码（kind 与 exitCode 内嵌，禁止命令层自行推导）。
 * 顺序与 `docs/json-contract.md` §3 逐行一致。
 */
export const CLI_ERROR_CODES = {
  NO_INIT: { code: 'NO_INIT', kind: 'refusal', exitCode: 1 },
  INVALID_ARGUMENT: { code: 'INVALID_ARGUMENT', kind: 'refusal', exitCode: 1 },
  STAGE_NOT_FOUND: { code: 'STAGE_NOT_FOUND', kind: 'refusal', exitCode: 1 },
  PHASE_TRANSITION_ILLEGAL: { code: 'PHASE_TRANSITION_ILLEGAL', kind: 'refusal', exitCode: 1 },
  PHASE_PATH_NOT_FOUND: { code: 'PHASE_PATH_NOT_FOUND', kind: 'refusal', exitCode: 1 },
  BLOCKING_REVIEWS: { code: 'BLOCKING_REVIEWS', kind: 'refusal', exitCode: 1 },
  ARCHIVE_GATE_REJECTED: { code: 'ARCHIVE_GATE_REJECTED', kind: 'refusal', exitCode: 1 },
  ARCHIVE_WRITE_FAILED: { code: 'ARCHIVE_WRITE_FAILED', kind: 'internal', exitCode: 3 },
  PROJECT_NOT_FOUND: { code: 'PROJECT_NOT_FOUND', kind: 'refusal', exitCode: 1 },
  FLOW_CONCURRENT_CONFLICT: { code: 'FLOW_CONCURRENT_CONFLICT', kind: 'refusal', exitCode: 2 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', kind: 'internal', exitCode: 3 },
  // stage-97 预留：archive <stage> --json 失败（本阶段不实现，仅登记映射）
  ARCHIVE_FAILED: { code: 'ARCHIVE_FAILED', kind: 'refusal', exitCode: 1 },
  // v1.2.4 A1：目标归档文件已存在且未显式 --force（零写盘拒绝）
  ARCHIVE_EXISTS: { code: 'ARCHIVE_EXISTS', kind: 'refusal', exitCode: 1 },
} as const;

/** 稳定错误码联合类型（由码表键派生，防字符串漂移） */
export type CliErrorCode = keyof typeof CLI_ERROR_CODES;

/** 有序 13 行映射表（顺序与契约文档 §3 逐行一致，供测试逐行断言） */
export const CLI_ERROR_TABLE: readonly CliErrorSpec[] = [
  CLI_ERROR_CODES.NO_INIT,
  CLI_ERROR_CODES.INVALID_ARGUMENT,
  CLI_ERROR_CODES.STAGE_NOT_FOUND,
  CLI_ERROR_CODES.PHASE_TRANSITION_ILLEGAL,
  CLI_ERROR_CODES.PHASE_PATH_NOT_FOUND,
  CLI_ERROR_CODES.BLOCKING_REVIEWS,
  CLI_ERROR_CODES.ARCHIVE_GATE_REJECTED,
  CLI_ERROR_CODES.ARCHIVE_WRITE_FAILED,
  CLI_ERROR_CODES.PROJECT_NOT_FOUND,
  CLI_ERROR_CODES.FLOW_CONCURRENT_CONFLICT,
  CLI_ERROR_CODES.INTERNAL_ERROR,
  CLI_ERROR_CODES.ARCHIVE_FAILED,
  CLI_ERROR_CODES.ARCHIVE_EXISTS,
];

/**
 * 按 code 取错误规格（kind / exitCode 的唯一读取入口）。
 * @param code 稳定错误码
 * @returns 该码的 {code, kind, exitCode}
 */
export function getCliErrorSpec(code: CliErrorCode): CliErrorSpec {
  return CLI_ERROR_CODES[code];
}

/**
 * 判定错误码是否属内部故障类。
 * @param code 稳定错误码
 * @returns kind === 'internal' 时为 true
 */
export function isInternalCode(code: CliErrorCode): boolean {
  return getCliErrorSpec(code).kind === 'internal';
}
