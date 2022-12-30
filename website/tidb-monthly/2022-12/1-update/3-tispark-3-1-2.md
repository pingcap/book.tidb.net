---
title: TiSpark 3.1.2 Release Notes - TiDB 社区技术月刊
sidebar_label: TiSpark 3.1.2 Release Notes
hide_title: true
description: 本篇为 TiSpark 3.1.2 Release Notes，包括新功能发布、 Bug 修复等。
keywords: [TiDB, Release Notes, 3.1.2, 新功能, TiSpark, Bug 修复]
---

# TiSpark 3.1.2 Release Notes

发版日期：2022 年 12 月 13 日

TiSpark 版本： 3.1.2

### 新特性

- 支持使用新的排序规则写入分区表 [#2570](https://github.com/pingcap/tispark/pull/2570)。
- 支持使用轮询策略负载均衡的读取 TiFlash [#2576](https://github.com/pingcap/tispark/pull/2576)。
- 支持 to_days 分区函数的分区裁剪 [#2594](https://github.com/pingcap/tispark/pull/2594) [#2600](https://github.com/pingcap/tispark/pull/2594)。

### 问题修复

- 修复基于代价优化模型，使得 TiSpark 能够正确的在 TiKV table scan, TiKV index scan 与 TiFlash scan 中选择最小代价 [#2568](https://github.com/pingcap/tispark/pull/2568)。
- 修复从 TiKV 读取时报 `region not find` 的错误 [#2575](https://github.com/pingcap/tispark/pull/2575)。
- 修复统计信息没有被采集的问题，该问题会影响执行计划的最终选择 [#2589](https://github.com/pingcap/tispark/pull/2589)。
- 与 TiDB v6.5.0 兼容 [#2602](https://github.com/pingcap/tispark/pull/2602)。

### New Features

- Support write into partition table with new collations [#2570](https://github.com/pingcap/tispark/pull/2570)
- Support read TiFlash load balancing with Round-Robin strategy [#2576](https://github.com/pingcap/tispark/pull/2576)
- Support partition pruning with to_days function when read from TiKV/TiFlash [#2594](https://github.com/pingcap/tispark/pull/2594) [#2600](https://github.com/pingcap/tispark/pull/2594)

### Fixes

- Fix CBO to let TiSpark choose the min cost between TiKV table scan, TiKV index scan and TiFlash scan correctly [#2568](https://github.com/pingcap/tispark/pull/2568)
- Fix the `region not find` error when reading from TiKV [#2575](https://github.com/pingcap/tispark/pull/2575)
- Fix the bug that statistics is not collected which may affect the choice of plans [#2589](https://github.com/pingcap/tispark/pull/2589)
- Compatible with TiDB v6.5.0 [#2602](https://github.com/pingcap/tispark/pull/2602)


更多发布信息，请查看 [TiSpark release notes](https://github.com/pingcap/tispark/releases/tag/3.1.2)。
相关文档地址：https://github.com/pingcap/tispark#readme。
