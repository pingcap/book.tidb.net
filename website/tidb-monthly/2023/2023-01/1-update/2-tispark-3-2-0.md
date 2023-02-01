---
title: TiSpark 3.2.0 Release Notes - TiDB 社区技术月刊
sidebar_label: TiSpark 3.2.0 Release Notes
hide_title: true
description: 本篇为 TiSpark v3.2.0 Release Notes，包括新功能发布、提升改进、文档优化等。
keywords: [TiDB, Release Notes, 3.2.0, TiSpark, 新功能发布, 提升改进, 文档优化]
---

# TiSpark 3.2.0 Release Notes

发版日期：2023 年 1 月 9 日

TiSpark 版本：3.2.1

## New Features

- 使用官方的 [client-java](https://github.com/tikv/client-java) 替换 TiSpark 中的 Java client [#2491](https://github.com/pingcap/tispark/pull/2491)。
- 和 TiDB TiDB v6.5.0 兼容 [#2598](https://github.com/pingcap/tispark/pull/2598)。
- 支持写入主键为 auto random 的表 [#2545](https://github.com/pingcap/tispark/pull/2545)。
- 支持 follower read [#2546](https://github.com/pingcap/tispark/pull/2546)。
- 支持使用新的排序规则写入分区表 [#2565](https://github.com/pingcap/tispark/pull/2565)。
- 支持在读取 TiKV 和 TiFlash 时对 to_days 函数的分区裁剪 [#2593](https://github.com/pingcap/tispark/pull/2593)。
- 支持轮询的策略读取 TiFlash 以支持负载均衡  [client-java #662](https://github.com/tikv/client-java/pull/662)。



## Fixes

- 升级 Spark 版本从 3.0.2 到 3.0.3，从 3.1.1 到 3.1.3，从 3.2.1 到 3.2.3，从 3.3.0 到 3.3.1 [#2544](https://github.com/pingcap/tispark/pull/2544) [#2607](https://github.com/pingcap/tispark/pull/2607)。
- 修复对读分区表的破坏性修改。如导致了 to_days 函数不被支持 [#2552](https://github.com/pingcap/tispark/pull/2552)。
- 修复当插入 year 的分区表，且表的第一个字段不为 date 类型时会抛出异常的 bug [#2554](https://github.com/pingcap/tispark/pull/2554)。
- 修复聚簇索引不为 int 类型时，该索引无法被使用的 bug [#2560](https://github.com/pingcap/tispark/pull/2560)。
- 修复基于代价优化可能无法从 TiKV table scan，TiKV index scan 和 TiFlash scanTiKV 中正确选择最小代价的 bug [#2563](https://github.com/pingcap/tispark/pull/2563)。
- 修复统计信息没有被收集的 bug，这会影响最终执行计划的选择 [#2578](https://github.com/pingcap/tispark/pull/2578)。
- 修复当分区字段为大写时无法应用分区裁剪的 bug [#2593](https://github.com/pingcap/tispark/pull/2593)。



## Documents

- 优化用户文档与开发者文档 [#2533](https://github.com/pingcap/tispark/pull/2533)。



更多发布信息，请查看 [TiSpark release notes](https://github.com/pingcap/tispark/releases/tag/v3.2.0)。

相关文档地址：https://github.com/pingcap/tispark#readme。

如有任何问题，可以联系发版团队 [release@pingcap.com](mailto:release@pingcap.com) 获得帮助。
