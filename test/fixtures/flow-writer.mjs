// test/fixtures/flow-writer.mjs — 子进程写入器：加载 → 等待 go 信号 → save
import { existsSync, writeFileSync } from 'node:fs';
import { FlowManager } from '../../dist/core/flow-manager.js';

const [projectDir, signalPath, goPath] = process.argv.slice(2);
const mgr = new FlowManager(projectDir);
writeFileSync(signalPath, 'loaded');
while (!existsSync(goPath)) { /* 忙等 */ }
try {
  mgr.save();
  process.exit(0);
} catch (err) {
  console.error('CONCURRENT:' + err.name);
  process.exit(err.name === 'FlowConcurrentModificationError' ? 2 : 3);
}
