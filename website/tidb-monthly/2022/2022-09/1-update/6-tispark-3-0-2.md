---
title: TiSpark 3.0.2 Release Notes - TiDB 社区技术月刊
sidebar_label: TiSpark 3.0.2 Release Notes
hide_title: true
description: 本篇为 TiSpark 3.0.2 Release Notes，包括兼容性变更、错误修复等。
keywords: [TiSpark, Release Notes, 3.0.2, 兼容性变更, 错误修复]
---

# TiSpark 3.0.2 Release Notes

发版日期：2022 年 9 月 5 日
TiSpark 版本：3.0.2

## Compatibility Changes

- We will not provide the mysql-connector-java dependency because of the limit of the GPL license [#2460](https://github.com/pingcap/tispark/pull/2460)

## Fixes

- Fix the bug that single column condition is in the incorrect `if branch` [#2395](https://github.com/pingcap/tispark/pull/2395)
- Fix when TiDB has more than 10,000 tables in one Database, TiSpark may throw Table not found exceptions [#2440](https://github.com/pingcap/tispark/pull/2440)
- Fix the bug that count/avg can not push down [#2470](https://github.com/pingcap/tispark/pull/2470)
- Fix the bug that when the primary key is not integer type, the two rows with null unique index will conflict and the bug that when the unique index conflicts, the conflicting unique index column cannot be deleted correctly [#2515](https://github.com/pingcap/tispark/pull/2515)
- Fix exception would through when the size of pdAddresse is > 1 [#2478](https://github.com/pingcap/tispark/pull/2478)
- Fix the bug that Count(bit) should not be pushed down before TiKV 6.0.0 [#2485](https://github.com/pingcap/tispark/pull/2485)
- Upgraded Spark3.1 support version from 3.0.2 to 3.0.3, Upgraded Spark3.1 support version from 3.1.1 to 3.1.3, Upgraded Spark3.2 support version from 3.2.1 to 3.2.2 [#2488](https://github.com/pingcap/tispark/pull/2488)
- Only do auth check for tables in TiDB [#2500](https://github.com/pingcap/tispark/pull/2500)
- Changed profile [#2518](https://github.com/pingcap/tispark/pull/2518)