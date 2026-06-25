/**
 * ArtifactGraph — 基于 Kahn 拓扑排序的构建依赖图
 * 
 * 核心职责：
 * 1. 解析 Schema 中的依赖关系（dependsOn + requires），构建邻接表和入度
 * 2. Kahn BFS 拓扑排序，检测循环依赖
 * 3. 给定已完成集合，返回当前可执行的 artifact
 * 4. 返回阻塞状态明细
 * 
 * 规则：
 * - dependsOn 字段中的所有 artifact ID 视为 hard 依赖
 * - requires 中 type='hard'（默认）的视为 hard 依赖
 * - requires 中 type='soft' 的不影响拓扑排序和就绪判断
 */
import type { Schema, Artifact, Dependency } from '../schema.js';
import type { BuildOrder, BlockedInfo, BlockedArtifacts } from './types.js';

export class ArtifactGraph {
  /** artifact ID → Artifact 对象的映射 */
  private artifacts: Map<string, Artifact>;

  /** artifact → 被它阻塞的 artifact 列表（出边） */
  private adjacency: Map<string, string[]>;

  /** artifact → 入度（还有多少 hard 依赖未满足） */
  private inDegree: Map<string, number>;

  constructor(schema: Schema) {
    this.artifacts = new Map();
    this.adjacency = new Map();
    this.inDegree = new Map();

    // 1. 注册所有 artifact
    for (const artifact of schema.artifacts) {
      this.artifacts.set(artifact.id, artifact);
      this.adjacency.set(artifact.id, []);
      this.inDegree.set(artifact.id, 0);
    }

    // 2. 构建邻接表和入度
    for (const artifact of schema.artifacts) {
      const hardDeps = this.collectHardDeps(artifact);

      for (const depId of hardDeps) {
        // 验证依赖目标存在
        if (!this.artifacts.has(depId)) {
          throw new Error(
            `Artifact "${artifact.id}" 依赖了不存在的 artifact "${depId}"`
          );
        }
        // depId → artifact.id（depId 完成后 artifact.id 才能开始）
        this.adjacency.get(depId)!.push(artifact.id);
        this.inDegree.set(artifact.id, (this.inDegree.get(artifact.id) ?? 0) + 1);
      }
    }
  }

  /**
   * 收集 artifact 的所有 hard 依赖 ID
   * 来源：dependsOn 字段（全 hard）+ requires 中 type='hard' 的条目
   */
  private collectHardDeps(artifact: Artifact): string[] {
    const hardDeps: string[] = [];

    // dependsOn 简写：全部视为 hard
    if (artifact.dependsOn) {
      hardDeps.push(...artifact.dependsOn);
    }

    // requires 数组：按 type 过滤
    if (artifact.requires) {
      for (const dep of artifact.requires) {
        // 默认 type 为 'hard'，只有显式 'soft' 才跳过
        if (dep.type !== 'soft') {
          hardDeps.push(dep.artifact);
        }
      }
    }

    // 去重：dependsOn 和 requires 可能包含相同的依赖 ID
    return [...new Set(hardDeps)];
  }

  /**
   * Kahn 拓扑排序（BFS）
   * @returns 拓扑排序后的 artifact ID 列表
   * @throws 检测到循环依赖时抛出异常
   */
  getBuildOrder(): BuildOrder {
    const order: string[] = [];
    // 复制入度表（不修改原始数据）
    const inDeg = new Map(this.inDegree);
    // BFS 队列：入度为 0 的节点
    const queue: string[] = [];

    // 初始化队列
    for (const [id, degree] of inDeg) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      // 按字典序排序，保证输出稳定
      queue.sort();
      const current = queue.shift()!;
      order.push(current);

      // 减少所有后继节点的入度
      for (const neighbor of this.adjacency.get(current) ?? []) {
        const newDeg = (inDeg.get(neighbor) ?? 1) - 1;
        inDeg.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 节点未全部输出 → 存在循环依赖
    if (order.length !== this.artifacts.size) {
      const remaining = [...this.artifacts.keys()].filter(
        (id) => !order.includes(id)
      );
      throw new Error(
        `检测到循环依赖，以下 artifact 陷入循环：${remaining.join(', ')}`
      );
    }

    return order;
  }

  /**
   * 获取下一步可执行的 artifact 列表
   * @param completed 已完成的 artifact ID 集合
   * @returns 所有 hard 依赖已满足的待执行 artifact ID 列表（按拓扑顺序）
   */
  getNextArtifacts(completed: Set<string>): string[] {
    const ready: string[] = [];

    for (const [id, artifact] of this.artifacts) {
      // 已完成的跳过
      if (completed.has(id)) {
        continue;
      }
      // 检查所有 hard 依赖是否都在 completed 中
      if (this.areHardDepsSatisfied(artifact, completed)) {
        ready.push(id);
      }
    }

    // 按拓扑排序保证稳定性
    return this.sortByTopoOrder(ready);
  }

  /**
   * 判断 artifact 的所有 hard 依赖是否已满足
   */
  private areHardDepsSatisfied(
    artifact: Artifact,
    completed: Set<string>
  ): boolean {
    const hardDeps = this.collectHardDeps(artifact);
    return hardDeps.every((depId) => completed.has(depId));
  }

  /**
   * 将 artifact ID 列表按 getBuildOrder 的顺序排列
   */
  private sortByTopoOrder(ids: string[]): string[] {
    // 缓存拓扑排序结果
    if (!this._buildOrder) {
      this._buildOrder = this.getBuildOrder();
    }
    const orderMap = new Map<string, number>();
    for (let i = 0; i < this._buildOrder.length; i++) {
      orderMap.set(this._buildOrder[i], i);
    }
    return ids.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
  }
  private _buildOrder: BuildOrder | null = null;

  /**
   * 全部 artifact 是否都已标记为完成
   */
  isComplete(completed: Set<string>): boolean {
    if (this.artifacts.size === 0) {
      return true; // 空 Schema 视为已完成
    }
    for (const id of this.artifacts.keys()) {
      if (!completed.has(id)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 获取当前阻塞状态明细
   * @param completed 已完成的 artifact ID 集合
   * @returns 阻塞状态，包含 ready、blocked、completed 列表
   */
  getBlocked(completed: Set<string>): BlockedArtifacts {
    const ready: string[] = [];
    const blocked: BlockedInfo[] = [];
    const completedArr: string[] = [];

    for (const [id, artifact] of this.artifacts) {
      if (completed.has(id)) {
        completedArr.push(id);
        continue;
      }

      const hardDeps = this.collectHardDeps(artifact);
      const missingDeps = hardDeps.filter((depId) => !completed.has(depId));

      if (missingDeps.length === 0) {
        ready.push(id);
      } else {
        blocked.push({
          artifactId: id,
          missingDeps,
          description: artifact.description,
        });
      }
    }

    return {
      blocked,
      ready: this.sortByTopoOrder(ready),
      completed: completedArr,
      total: this.artifacts.size,
      done: completedArr.length,
    };
  }
}
