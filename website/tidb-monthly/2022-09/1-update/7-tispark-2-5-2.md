---
title: TiSpark 2.5.2 Release Notes - TiDB 社区技术月刊
sidebar_label: TiSpark 2.5.2 Release Notes
hide_title: true
description: 本篇为 TiSpark 2.5.2 Release Notes，包括兼容性变更、错误修复等。
keywords: [TiSpark, Release Notes, 2.5.2, 兼容性变更, 错误修复]
---

# TiSpark 2.5.2 Release Notes

发版日期：2022 年 9 月 5 日

TiSpark 版本：2.5.1

## Compatibility Changes

- We will not provide the mysql-connector-java dependency because of the limit of the GPL license [#2461](https://github.com/pingcap/tispark/pull/2461)

## Fixes

- Fix the bug that single column condition is incorrect `if branch` [#2394](https://github.com/pingcap/tispark/pull/2394)
- Fix when TiDB has more than 10,000 tables in one Database, TiSpark may throw Table not found exceptions [#2441](https://github.com/pingcap/tispark/pull/2441)
- Fix the bug that count/avg can not push down [#2469](https://github.com/pingcap/tispark/pull/2469)
- Fix the bug that when the primary key is not integer type, the two rows with null unique index will conflict and the bug that when the unique index conflicts, the conflicting unique index column cannot be deleted correctly [#2516](https://github.com/pingcap/tispark/pull/2516)
- Fix exception would through when the size of pdAddresse is > 1 [#2477](https://github.com/pingcap/tispark/pull/2477)
- Fix the bug that Count(bit) should not be pushed down before TiKV 6.0.0 [#2484](https://github.com/pingcap/tispark/pull/2484)
- Upgraded Spark3.1 support version from 3.0.2 to 3.0.3，Upgraded Spark3.1 support version from 3.1.1 to 3.1.3 [#2487](https://github.com/pingcap/tispark/pull/2487)
- Only do auth check for tables in TiDB [#2502](https://github.com/pingcap/tispark/pull/2502)
- Change spark profile [#2517](https://github.com/pingcap/tispark/pull/2517)