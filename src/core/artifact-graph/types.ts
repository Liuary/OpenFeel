/**
 * ArtifactGraph 相关类型定义
 * 从 ../schema.js 重导出核心类型，并定义图运算相关的状态类型
 */
export type { Schema, Artifact, Dependency } from '../schema.js';

/** 构建顺序：按拓扑排序的 artifact ID 列表 */
export type BuildOrder = string[];

/** 单个被阻塞的 artifact 信息 */
export interface BlockedInfo {
  artifactId: string;                          // 被阻塞的 artifact ID
  missingDeps: string[];                       // 尚未满足的依赖 artifact ID 列表
  description?: string;                        // artifact 描述
}

/** 整体阻塞状态 */
export interface BlockedArtifacts {
  blocked: BlockedInfo[];                      // 被阻塞的 artifact 列表
  ready: string[];                             // 当前可执行的 artifact ID 列表
  completed: string[];                         // 已完成的 artifact ID 列表
  total: number;                               // artifact 总数
  done: number;                                // 已完成数量
}
