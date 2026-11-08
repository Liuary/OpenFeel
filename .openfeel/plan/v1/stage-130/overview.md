# v1.5.15-stage-130

## 目标

> 修复 `getUserName` 把 `.info.json` 的 `unknown` 哨兵当有效用户名、导致 `feel_req claim` 仍必须显式 `--owner` 的残留问题；并让 `ensureInfoJson` 能自愈历史 `unknown`。

## 依赖

无

## 操作方案

- op-001：`getUserName` 哨兵回落 + `ensureInfoJson` 自愈（fast 模式不单列 op，按计划三节执行）
