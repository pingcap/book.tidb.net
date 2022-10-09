---
title: TiSpark 3.1.0 Release Notes - TiDB 社区技术月刊
sidebar_label: TiSpark 3.1.0 Release Notes
hide_title: true
description: 本篇为 TiSpark 3.1.0 Release Notes，包括兼容性变更、新功能发布、错误修复等。
keywords: [TiSpark, Release Notes, 3.1.0, 兼容性变更, 新功能修复, 错误修复]
---

# TiSpark 3.1.0 Release Notes

发版日期：2022 年 9 月 13 日
TiSpark 版本：3.1.0

## Compatibility Changes

- We will not provide the mysql-connector-java dependency because of the limit of the GPL license [#2457](https://github.com/pingcap/tispark/pull/2457)

## New Features

- Add authorization check for datasource api [#2366](https://github.com/pingcap/tispark/pull/2366)
- Make TiSpark's Explain clearer and easier to read [#2439](https://github.com/pingcap/tispark/pull/2439)
- Support host mapping in TiSpark [#2436](https://github.com/pingcap/tispark/pull/2436)
- Support bypass-TiDB write into partition table [#2451](https://github.com/pingcap/tispark/pull/2451)
- Support insert sql [#2471](https://github.com/pingcap/tispark/pull/2471)
- Support Spark 3.3 [#2492](https://github.com/pingcap/tispark/pull/2492)
- Only do auth check for tables in TiDB [#2489](https://github.com/pingcap/tispark/pull/2489)
- Support new Collation [#2524](https://github.com/pingcap/tispark/pull/2524)

## Fixes

- Fix when TiDB has more than 10,000 tables in one Database, TiSpark may throw table not found exceptions [#2433](https://github.com/pingcap/tispark/pull/2433)
- Fix the bug that count/avg can not push down [#2445](https://github.com/pingcap/tispark/pull/2445)
- Fix the bug that when the primary key is not integer type, the two rows with null unique index will conflict. And the bug that when the unique index conflicts, the conflicting unique index column cannot be deleted correctly [#2455](https://github.com/pingcap/tispark/pull/2455)
- Fix the bug that exception would through when the size of pdAddresse is > 1 [#2473](https://github.com/pingcap/tispark/pull/2473)
- Fix the bug that Count(bit) should not be pushed down before TiKV 6.0.0 [#2476](https://github.com/pingcap/tispark/pull/2476)
- Upgraded Spark 3.1 support version from 3.0.2 to 3.0.3, upgraded Spark 3.1 support version from 3.1.1 to 3.1.3, upgraded Spark 3.2 support version from 3.2.1 to 3.2.2 [#2486](https://github.com/pingcap/tispark/pull/2486)
- Fix the bug that exception will be throw when date col is not the first col ref [#2538](https://github.com/pingcap/tispark/pull/2538)