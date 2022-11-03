---
title: TiSpark 2.4.4 Release Note - TiDB 社区技术月刊
sidebar_label: TiSpark 2.4.4 Release Note
hide_title: true
description: 本篇为 TiSpark 2.4.4 Release Notes，主要为错误修复。
keywords: [TiDB, 2.4.4, Release Notes, 兼容性变化, 错误修复]
---

# TiSpark 2.4.4 Release Note

发版日期：2022 年 10 月 13 日

TiSpark 版本：2.4.4

### Compatibility Changes

- We will not provide the mysql-connector-java dependency because of the limit of the GPL license [#2460](https://github.com/pingcap/tispark/pull/2460).

### Fixes

- Fix the bug that single column condition is in the incorrect if branch [#2393](https://github.com/pingcap/tispark/pull/2393).
- Fix region may be missed with too many tables [#2442](https://github.com/pingcap/tispark/pull/2442).
- Fix the bug that count can not be pushed down [#2468](https://github.com/pingcap/tispark/pull/2468) [#2483](https://github.com/pingcap/tispark/pull/2483)