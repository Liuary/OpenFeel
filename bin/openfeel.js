#!/usr/bin/env node
// OpenFeel CLI 入口 — 加载并启动 Commander 程序
import { program } from '../dist/cli/index.js';

program.parse();
